import * as utils from "./utils.js";

class PopupController
{
    constructor(storage)
    {
        this.storage = storage;
        this.mainPageGridContainer = document.querySelectorAll(".grid-container")[0];
        this.settingsPageGridContainer = document.querySelectorAll(".grid-container")[1];

        this.nominatimRequestQueue = Promise.resolve();
        this.nominatimRequestIntervalMs = 2000; // Nominatim usage policy allows 1 request per second
        this.lastNominatimRequestTime = 0;

        // Listen for messages from background.js
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) =>
        {
            switch (msg.action)
            {
                case "prayerChanged":
                    utils.timeLog("Received prayerChanged message:", msg.data);
                    this.storage.isPrayed = msg.data.isPrayed;
                    this.displayPrayerTimes(msg.data.todayPrayerTimes);
                    break;
                default:
                    break;
            }
        });
    }

    static async init()
    {
        const storage = await chrome.storage.local.get(null);
        return new PopupController(storage);
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // Header                                                                                         //
    ////////////////////////////////////////////////////////////////////////////////////////////////////
    async appendLogoIcon()
    {
        // Check if already appended
        let logoIcon = document.getElementById("logo-icon");
        if (logoIcon) return;

        // Create logo icon element
        const logoSvg = await fetch("../assets/icon.svg").then(res => res.text());
        logoIcon = document.createElement("div");
        logoIcon.id = "logo-icon";
        logoIcon.innerHTML = logoSvg;

        // Prepend to header
        const header = document.querySelector(".header");
        header.prepend(logoIcon);
    }

    // TODO clean up and modularize
    async addSettingsButtonEventListeners()
    {
        const content = document.querySelector(".content");
        if (!content) return; // Can't proceed without content container

        let settingsButton = document.getElementById("settings-button");
        if (!settingsButton) return; // Can't proceed without settings button

        // Remove existing event listeners (safety net)
        settingsButton.replaceWith(settingsButton.cloneNode(true));
        settingsButton = document.getElementById("settings-button");

        const mainPage = document.getElementById("main-page");
        const settingsPage = document.getElementById("settings-page");

        function resizePopupToFitContent()
        {
            const popupContainer = document.querySelector(".popup-container");
            if (!popupContainer) return;

            popupContainer.style.height = "auto"; // reset to measure accurately
            const newHeight = popupContainer.scrollHeight;
            document.body.style.height = `${newHeight}px`;
        }

        // Toggle settings on click
        settingsButton.addEventListener("click", () =>
        {
            content.classList.toggle("show-settings");
            settingsButton.classList.toggle("active");

            // Toggle visible page
            const isSettingsVisible = content.classList.contains("show-settings");
            if (isSettingsVisible)
            {
                mainPage.style.display = "none";
                settingsPage.style.display = "block";
            }
            else
            {
                settingsPage.style.display = "none";
                mainPage.style.display = "block";
            }

            // Adjust popup height
            resizePopupToFitContent();
        });

        // Toggle settings if no prayer times yet
        if (!this.storage.prayerTimes)
        {
            content.classList.add("show-settings");
            settingsButton.classList.add("active");

            mainPage.style.display = "none";
            settingsPage.style.display = "block";

            resizePopupToFitContent();
        }
        else
        {
            // Ensure main page shows by default
            settingsPage.style.display = "none";
            mainPage.style.display = "block";

            resizePopupToFitContent();
        }
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // Settings Page                                                                                  //
    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // Location Input                                                                                 //
    ////////////////////////////////////////////////////////////////////////////////////////////////////
    scheduleNominatimRequest(func)
    {
        // Chain requests to ensure they respect the interval
        this.nominatimRequestQueue = this.nominatimRequestQueue.then(async () =>
        {
            // Calculate wait time
            const now = Date.now();
            const wait = Math.max(0, this.nominatimRequestIntervalMs - (now - this.lastNominatimRequestTime)); // Enforce 2s interval between requests

            // Wait if needed
            if (wait > 0)
            {
                utils.timeLog(`Scheduling Nominatim request. Will wait ${wait} ms before sending.`);
                await new Promise(res => setTimeout(res, wait));
            }

            // Update last request time
            this.lastNominatimRequestTime = Date.now();

            // Send request
            utils.timeLog("Sending Nominatim request now.");
            return func();
        });
        return this.nominatimRequestQueue;
    }

    async fetchLocationResults(query)
    {
        return this.scheduleNominatimRequest(async () =>
        {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`,
                { headers: { "User-Agent": "https://github.com/9iiota/prayer-times-namaz-vakitleri-extension" } }
            );
            if (!response.ok) throw new Error(`Nominatim request failed. Status: ${response.status}`);
            return response.json();
        });
    }

    formatLocationName(address)
    {
        // Format location name from address components in "City, State, Country" format
        const cityTownVillage = address.city || address.town || address.village;
        const stateProvince = address.state || address.province;
        const country = address.country;

        const parts = [cityTownVillage, stateProvince, country];
        return parts.filter(Boolean).join(", ");
    }

    fetchLocationDetails(locationResult)
    {
        return this.scheduleNominatimRequest(async () =>
        {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(locationResult.lat)}&lon=${encodeURIComponent(locationResult.lon)}&addressdetails=1`,
                { headers: { "User-Agent": "https://github.com/9iiota/prayer-times-namaz-vakitleri-extension" } }
            );
            if (!response.ok) throw new Error(`Nominatim reverse request failed. Status: ${response.status}`);
            return await response.json();
        });
    }

    updateParameters(locationDetails)
    {
        // Extract zip code without extra details (e.g., "12345-6789" -> "12345")
        const zipCode = locationDetails.address.postcode ? String(locationDetails.address.postcode).split(/[-\s]/)[0] : "";

        // Merge existing parameters with the new location data and coordinates
        // Any overlapping keys (e.g., city, state, country) from the new location
        // will overwrite the old values, while preserving all other existing parameters
        return { ...this.storage.parameters, countryCode: locationDetails.address.country_code, zipCode: zipCode, latitude: locationDetails.lat, longitude: locationDetails.lon, country: locationDetails.address.country, state: locationDetails.address.state || locationDetails.address.province || "", city: locationDetails.address.city || locationDetails.address.town || locationDetails.address.village || "" };
    }

    async onStorageChange(previousStorage)
    {
        // Determine what has changed
        const changed = {};
        for (const key of Object.keys(this.storage))
        {
            const previousValue = previousStorage[key];
            const currentValue = this.storage[key];

            // Deep compare for objects/arrays
            if (typeof currentValue === "object" && currentValue !== null)
            {
                if (JSON.stringify(previousValue) !== JSON.stringify(currentValue))
                {
                    changed[key] = true;
                }
            }
            else
            {
                if (previousValue !== currentValue)
                {
                    changed[key] = true;
                }
            }
        }

        // Handle changes
        for (const key of Object.keys(changed))
        {
            switch (key)
            {
                case "display":
                    // Update storage
                    chrome.storage.local.set({ display: this.storage.display });
                    break;
                case "isPrayed":
                    // Update storage
                    chrome.storage.local.set({ isPrayed: this.storage.isPrayed });

                    // Update current prayer background color
                    await this.updateCurrentPrayerBackgroundColor();
                    break;
                case "isNotificationsOn":
                    // Update storage
                    chrome.storage.local.set({ isNotificationsOn: this.storage.isNotificationsOn });
                    break;
                case "notificationsMinutesBefore":
                    // Update storage
                    chrome.storage.local.set({ notificationsMinutesBefore: this.storage.notificationsMinutesBefore });
                    break;
                case "parameters":
                    // Update storage
                    chrome.storage.local.set({ parameters: this.storage.parameters });

                    // Wait for background script to process new parameters and update prayer times
                    const data = await this.awaitBackgroundMessage("prayerTimesProcessed");
                    this.storage.prayerTimes = data.prayerTimes;

                    // Update displayed prayer times
                    await this.updateAndDisplayPrayerTimes();
                    break;
                case "prayerTimes":
                    break;
                default:
                    console.log(`Unhandled change in key: ${key}`);
                    break;
            }
        }
        return changed;
    }

    getPrayerTimesByDate(date)
    {
        const targetDate = new Date(date);
        const dateStr = targetDate.toISOString().split("T")[0];
        return this.storage.prayerTimes.find(entry => entry.date === dateStr);
    }

    getDailyPrayerTimes()
    {
        return this.getPrayerTimesByDate(new Date());
    }

    async updateCurrentPrayerBackgroundColor()
    {
        const currentPrayerContainer = document.getElementById("current-prayer");
        if (currentPrayerContainer)
        {
            let backgroundColor = utils.COLORS.LIGHT_BLUE;
            const sunPrayerContainer = document.querySelectorAll(".prayer")[1];
            if (this.storage.isPrayed)
            {
                backgroundColor = utils.COLORS.LIGHT_GREEN;
            }
            else if (currentPrayerContainer !== sunPrayerContainer)
            {
                const badgeText = await chrome.action.getBadgeText({});
                if (badgeText.includes("m"))
                {
                    backgroundColor = utils.COLORS.LIGHT_RED;
                }
            }
            currentPrayerContainer.style.backgroundColor = backgroundColor;
        }
    }

    async displayPrayerTimes(dailyPrayerTimes)
    {
        // Clear existing prayers if no data
        if (!dailyPrayerTimes || !Array.isArray(dailyPrayerTimes.times))
        {
            utils.timeLog("No daily prayer times available to display.");
            this.mainPageGridContainer.querySelectorAll(".prayer").forEach(element => element.remove());
            return;
        }

        // Clear old current-prayer ids
        document.querySelectorAll("#current-prayer").forEach(element =>
        {
            element.removeAttribute("id");
            element.style.backgroundColor = "";
        });

        // Loop through prayers
        const currentPrayerIndex = utils.getCurrentPrayerIndex(dailyPrayerTimes);
        for (const [index, name] of utils.PRAYER_NAMES.entries())
        {
            let prayerContainer = this.mainPageGridContainer.querySelectorAll(".prayer")[index];
            if (!prayerContainer)
            {
                // Create prayer elements
                prayerContainer = document.createElement("button");
                prayerContainer.className = "prayer";
                if (this.storage.display === "flex") prayerContainer.classList.add("display-flex");
                if (this.storage.display === "columns") prayerContainer.classList.add("display-columns");

                const nameSpan = document.createElement("span");
                nameSpan.className = "prayer-name";
                nameSpan.textContent = name;

                const timeSpan = document.createElement("span");
                timeSpan.className = "prayer-time";

                // Assemble and append
                prayerContainer.appendChild(nameSpan);
                prayerContainer.appendChild(timeSpan);
                this.mainPageGridContainer.appendChild(prayerContainer);
            }

            // Update prayer time
            const timeSpan = prayerContainer.querySelector(".prayer-time");
            timeSpan.textContent = dailyPrayerTimes.times[index];

            // Highlight current prayer
            if (index === currentPrayerIndex)
            {
                // Clone to remove previous event listeners
                const newButton = prayerContainer.cloneNode(true);
                prayerContainer.replaceWith(newButton);
                prayerContainer = newButton;
                prayerContainer.id = "current-prayer";

                // Toggle isPrayed on click
                prayerContainer.addEventListener("click", async () =>
                {
                    // Clone previous storage for comparison
                    const previousStorage = structuredClone(this.storage);

                    // Update storage
                    this.storage.isPrayed = !this.storage.isPrayed;
                    await this.onStorageChange(previousStorage);
                });

                // Update background color
                this.updateCurrentPrayerBackgroundColor();
            }
        }
    }

    async updateAndDisplayPrayerTimes()
    {
        const dailyPrayerTimes = this.getDailyPrayerTimes();
        await this.displayPrayerTimes(dailyPrayerTimes);
    }

    renderLocationResults(locationResults)
    {
        // Clear previous results
        const locationName = document.querySelector(".location-name");
        const locationResultsContainer = document.querySelector(".location-container>.options");
        locationResultsContainer.innerHTML = "";

        // Render new results
        if (locationResults.length === 0)
        {
            const noResults = document.createElement("div");
            noResults.textContent = "No results found.";
            locationResultsContainer.appendChild(noResults);
            return;
        }
        else
        {
            for (const locationResult of locationResults)
            {
                // Create option element
                const formattedLocationName = this.formatLocationName(locationResult.address);
                const option = document.createElement("div");
                option.textContent = formattedLocationName;

                // Handle option selection
                option.addEventListener("click", async () =>
                {
                    this.toggleLoader();
                    const previousStorage = structuredClone(this.storage);

                    // Update storage with selected location
                    locationResultsContainer.style.display = "none";
                    locationName.textContent = formattedLocationName;
                    locationName.contentEditable = false;
                    try
                    {
                        // Save location details
                        const locationDetails = await this.fetchLocationDetails(locationResult);
                        this.storage.parameters = this.updateParameters(locationDetails);

                        // Update storage
                        await this.onStorageChange(previousStorage);

                        // Update displayed prayer times
                        await this.updateAndDisplayPrayerTimes();
                    }
                    catch (error)
                    {
                        console.error("Error processing selected location:", error);
                    }

                    this.toggleLoader();
                });
                locationResultsContainer.appendChild(option);
            }
        }
        locationResultsContainer.style.display = "block";
    }

    addLocationEventListeners()
    {
        const locationContainer = document.querySelector(".location-container");
        if (!locationContainer) return; // Can't proceed without container

        const locationName = locationContainer.querySelector(".location-name");
        if (!locationName) return; // Can't proceed without location name span

        // Set location name
        if (this.storage.parameters.country && this.storage.parameters.city)
        {
            if (this.storage.parameters.state)
            {
                locationName.textContent = `${this.storage.parameters.city}, ${this.storage.parameters.state}, ${this.storage.parameters.country}`;
            }
            else
            {
                locationName.textContent = `${this.storage.parameters.city}, ${this.storage.parameters.country}`;
            }
        }

        // Make location name editable on click
        locationName.addEventListener("click", () =>
        {
            locationName.contentEditable = true;
            locationName.focus();

            // Select all text content in a standards-compliant way
            const range = document.createRange();
            range.selectNodeContents(locationName);
            const sel = window.getSelection();
            if (sel)
            {
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        // Handle location name changes on enter key press
        locationName.addEventListener("keydown", async (event) =>
        {
            if (event.key !== "Enter") return;
            event.preventDefault();

            const newLocation = locationName.textContent.trim();
            if (newLocation.length === 0) return;

            this.toggleLoader();

            try
            {
                // Fetch location results
                const locationResults = await this.fetchLocationResults(newLocation);
                utils.timeLog("Fetched addresses:", locationResults);

                // Render location results in dropdown
                await this.renderLocationResults(locationResults);
            }
            catch (error)
            {
                utils.timeLog("Error fetching location results:", error);
            }

            this.toggleLoader();
        });
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // Dropdowns                                                                                      //
    ////////////////////////////////////////////////////////////////////////////////////////////////////
    async addDropdownEventListeners({ methodSelectId, optionsContainerId, getStorageSection, settingKey })
    {
        const methodSelect = document.getElementById(methodSelectId);
        if (!methodSelect) return; // Can't proceed without method select button

        const methodName = methodSelect.querySelector(".method-name");
        if (!methodName) return; // Can't proceed without method name span

        const optionsContainer = document.getElementById(optionsContainerId);
        if (!optionsContainer) return; // Can't proceed without options container

        const storageSection = getStorageSection?.();
        if (!storageSection) return; // Can't proceed without storage section
        if (!settingKey || !(settingKey in storageSection)) return; // Can't proceed without valid setting key

        // Set chosen option
        const chosenOptionValue = storageSection[settingKey];
        const chosenOptionText = optionsContainer.querySelector(`div[value='${chosenOptionValue}']`)?.textContent;
        if (!chosenOptionText) return; // Can't proceed without chosen option text

        methodName.textContent = chosenOptionText;

        // Toggle dropdown on click
        methodSelect.addEventListener("click", () =>
        {
            optionsContainer.style.display = optionsContainer.style.display === "block" ? "none" : "block";
        });

        // Handle option selection
        const options = optionsContainer.querySelectorAll("div");
        if (options.length === 0) return; // Can't proceed without options

        options.forEach(option =>
        {
            option.addEventListener("click", async () =>
            {
                this.toggleLoader();
                const previousStorage = structuredClone(this.storage);

                // Update storage dynamically using the latest section
                const sectionNow = getStorageSection?.();
                if (!sectionNow)
                {
                    this.toggleLoader();
                    return;
                }

                // Update storage
                sectionNow[settingKey] = option.getAttribute("value");
                await this.onStorageChange(previousStorage);

                // Remove selected class from all options
                optionsContainer.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));

                // Highlight selected option
                option.classList.add("selected");

                // Update displayed method name and close dropdown
                methodName.textContent = option.textContent;
                optionsContainer.style.display = "none";

                this.toggleLoader();
            });
        });

        // Highlight selected option
        options.forEach(option =>
        {
            if (option.getAttribute("value") === chosenOptionValue)
            {
                option.classList.add("selected");
            }
        });
    }

    async addNotificationEventListeners(notificationsButtonId)
    {
        const notificationsButton = document.getElementById(notificationsButtonId);
        if (!notificationsButton) return; // Can't proceed without button

        // Set initial icon
        const svgPath = this.storage.isNotificationsOn ? "../assets/icons/bell.svg" : "../assets/icons/bell-slash.svg";
        const bellSvg = await fetch(svgPath).then(res => res.text());
        notificationsButton.innerHTML = bellSvg;

        // Set initial active state
        if (this.storage.isNotificationsOn) notificationsButton.classList.add("active");

        // Toggle notifications on click
        notificationsButton.addEventListener("click", async () =>
        {
            this.toggleLoader();
            const previousStorage = structuredClone(this.storage);

            // Update storage
            this.storage.isNotificationsOn = !this.storage.isNotificationsOn;
            await this.onStorageChange(previousStorage);

            // Update icon
            const newSvgPath = this.storage.isNotificationsOn ? "../assets/icons/bell.svg" : "../assets/icons/bell-slash.svg";
            const newSvg = await fetch(newSvgPath).then(res => res.text());
            notificationsButton.innerHTML = newSvg;

            notificationsButton.classList.toggle("active");

            this.toggleLoader();
        });
    }

    // TODO clean up and modularize
    async addDisplayToggleEventListeners(displayFlexButtonId, displayGridButtonId, displayColumnsButtonId)
    {
        const displayFlexButton = document.getElementById(displayFlexButtonId);
        const displayGridButton = document.getElementById(displayGridButtonId);
        const displayColumnsButton = document.getElementById(displayColumnsButtonId);

        if (!displayFlexButton || !displayGridButton || !displayColumnsButton || !this.mainPageGridContainer) return;

        const prayerElements = () => document.querySelectorAll(".prayer");

        const setActiveButton = (mode) =>
        {
            displayFlexButton.classList.toggle("active", mode === "flex");
            displayGridButton.classList.toggle("active", mode === "grid");
            displayColumnsButton.classList.toggle("active", mode === "columns");
        };

        const applyDisplayMode = (mode) =>
        {
            const elements = prayerElements();
            this.mainPageGridContainer.classList.toggle("display-columns", mode === "columns");

            elements.forEach(el =>
            {
                el.classList.toggle("display-flex", mode === "flex");
                el.classList.toggle("display-columns", mode === "columns");
                if (mode === "grid")
                {
                    el.classList.remove("display-flex", "display-columns");
                }
            });
        };

        const updateDisplayMode = async (mode) =>
        {
            if (this.storage.display === mode) return;

            this.toggleLoader();

            const previousStorage = { ...this.storage };
            this.storage.display = mode;
            await this.onStorageChange(previousStorage);

            setActiveButton(mode);
            applyDisplayMode(mode);

            this.toggleLoader();
        };

        // Set initial mode
        setActiveButton(this.storage.display);
        applyDisplayMode(this.storage.display);

        // Event listeners
        displayFlexButton.addEventListener("click", () => updateDisplayMode("flex"));
        displayGridButton.addEventListener("click", () => updateDisplayMode("grid"));
        displayColumnsButton.addEventListener("click", () => updateDisplayMode("columns"));
    }

    awaitBackgroundMessage(messageAction)
    {
        return new Promise(resolve =>
        {
            const listener = (message, sender, sendResponse) =>
            {
                if (message.action === messageAction)
                {
                    chrome.runtime.onMessage.removeListener(listener);
                    resolve(message.data);
                }
            };
            chrome.runtime.onMessage.addListener(listener);
        });
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // Miscellaneous                                                                                  //
    ////////////////////////////////////////////////////////////////////////////////////////////////////
    toggleLoader()
    {
        let loader = document.querySelector(".loader");
        if (loader)
        {
            loader.remove();
        }
        else
        {
            loader = document.createElement("div");
            loader.className = "loader";
            document.body.prepend(loader);
        }
    }
}

document.addEventListener("DOMContentLoaded", async () =>
{
    const popupController = await PopupController.init();

    // Header
    // popupController.appendLogoIcon();
    popupController.addSettingsButtonEventListeners();

    // Main Page
    if (popupController.storage && popupController.storage.prayerTimes)
    {
        const dailyPrayerTimes = popupController.getPrayerTimesByDate(new Date());
        popupController.displayPrayerTimes(dailyPrayerTimes);
    }

    // Settings Page
    popupController.addLocationEventListeners();
    const dropdowns = [
        { methodSelectId: "prayer-calculation-method-select", optionsContainerId: "prayer-calculation-method-options", getStorageSection: () => popupController.storage.parameters, settingKey: "calculationMethodId" },
        { methodSelectId: "asr-jurisdiction-method-select", optionsContainerId: "asr-jurisdiction-method-options", getStorageSection: () => popupController.storage.parameters, settingKey: "asrMethodId" },
        { methodSelectId: "notifications-minutes-before-select", optionsContainerId: "notifications-minutes-before-options", getStorageSection: () => popupController.storage, settingKey: "notificationsMinutesBefore" },
    ]
    for (const config of dropdowns)
    {
        await popupController.addDropdownEventListeners(config);
    }

    popupController.addNotificationEventListeners("notifications-button");
    popupController.addDisplayToggleEventListeners("display-flex", "display-grid", "display-columns");

    // Close dropdowns when clicking outside
    document.addEventListener("click", (event) =>
    {
        // Method dropdowns
        const dropdowns = document.querySelectorAll(".method-container");
        dropdowns.forEach(dropdown =>
        {
            const methodSelect = dropdown.querySelector(".method-select");
            const optionsContainer = dropdown.querySelector(".method-select-wrapper>.options");

            if (methodSelect && optionsContainer && !methodSelect.contains(event.target) && !optionsContainer.contains(event.target))
            {
                optionsContainer.style.display = "none";
            }
        });

        // Location dropdown
        const locationContainer = document.querySelector(".location-container>.options");
        const locationSpan = document.querySelector(".location-name");
        if (locationContainer && locationSpan && !locationContainer.contains(event.target) && event.target !== locationSpan)
        {
            locationContainer.style.display = "none";
            locationSpan.contentEditable = false;
        }
    });
});
