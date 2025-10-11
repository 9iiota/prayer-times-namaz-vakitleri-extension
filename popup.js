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
        const logoSvg = await fetch("icons/icon.svg").then(res => res.text());
        logoIcon = document.createElement("div");
        logoIcon.id = "logo-icon";
        logoIcon.innerHTML = logoSvg;

        // Prepend to header
        const header = document.querySelector(".header");
        header.prepend(logoIcon);
    }

    async appendSettingsButton()
    {
        // Check if already appended
        let settingsButton = document.getElementById("settings-button");
        if (settingsButton) return;

        // Create settings button element
        const settingsSvg = await fetch("icons/settings.svg").then(res => res.text());
        settingsButton = document.createElement("button");
        settingsButton.id = "settings-button";
        settingsButton.className = "icon-button";
        settingsButton.innerHTML = settingsSvg;
        settingsButton.addEventListener("click", () =>
        {
            document.querySelector(".content").classList.toggle("show-settings");
            settingsButton.classList.toggle("active");
        });

        // Append to header
        const header = document.querySelector(".header");
        header.append(settingsButton);

        // If no prayer times yet, open settings by default
        if (!this.storage.prayerTimes)
        {
            document.querySelector(".content").classList.toggle("show-settings");
            settingsButton.classList.toggle("active");
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
        const zipCode = locationDetails.address.postcode?.split(" ")[0] ?? "";

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
                case "isPrayed":
                    // Update storage
                    chrome.storage.local.set({ isPrayed: this.storage.isPrayed });
                    utils.timeLog("isPrayed changed to:", this.storage.isPrayed);

                    // Update current prayer background color
                    await this.updateCurrentPrayerBackgroundColor();
                    break;
                case "isNotificationsOn":
                    // TODO
                    break;
                case "notificationsMinutesBefore":
                    break;
                case "parameters":
                    // Update storage
                    chrome.storage.local.set({ parameters: this.storage.parameters });
                    utils.timeLog(`Parameters changed from `, previousStorage.parameters, "to", this.storage.parameters);

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
            this.gridContainer.querySelectorAll(".prayer").forEach(element => element.remove());
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

                    // Toggle isPrayed state
                    this.storage.isPrayed = !this.storage.isPrayed;

                    // Update storage
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

    appendLocationInput()
    {
        // Check if already appended
        let locationContainer = document.querySelector(".location-container");
        if (locationContainer) return;

        // Create location input elements
        locationContainer = document.createElement("div");
        locationContainer.className = "location-container";

        const locationName = document.createElement("span");
        locationName.className = "location-name";

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
        else
        {
            locationName.textContent = "Click to type city name";
        }

        // Make location name editable on click
        locationName.addEventListener("click", () =>
        {
            locationName.contentEditable = true;
            locationName.focus();
            document.execCommand("selectAll", false, null); // Select all text for easy replacement
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

        // Create options container for dropdown results
        const optionsContainer = document.createElement("div");
        optionsContainer.className = "options";

        // Assemble and prepend to settings grid
        locationContainer.appendChild(locationName);
        locationContainer.appendChild(optionsContainer);
        this.settingsPageGridContainer.prepend(locationContainer);
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // Dropdowns                                                                                      //
    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // TODO clean from here
    async appendDropdown({ labelText, optionsDictionary, controllerParentObject, controllerParentObjectKey, containerId = null })
    {
        const methodContainer = document.createElement("div");
        if (containerId) methodContainer.id = containerId;
        methodContainer.className = "method-container";
        this.settingsPageGridContainer.appendChild(methodContainer);

        const methodLabel = document.createElement("span");
        methodLabel.className = "method-label";
        methodLabel.textContent = labelText;
        methodContainer.appendChild(methodLabel);

        const methodSelectWrapper = document.createElement("div");
        methodSelectWrapper.className = "method-select-wrapper";
        methodContainer.appendChild(methodSelectWrapper);

        const methodSelect = document.createElement("button");
        methodSelect.className = "method-select";
        methodSelectWrapper.appendChild(methodSelect);

        const methodName = document.createElement("span");
        methodName.className = "method-name";
        methodSelect.appendChild(methodName);

        const optionsContainer = document.createElement("div");
        optionsContainer.className = "options";
        methodSelectWrapper.appendChild(optionsContainer);

        // Set chosen option
        methodName.textContent = optionsDictionary[controllerParentObject[controllerParentObjectKey]];

        // Toggle dropdown
        methodSelect.addEventListener("click", () =>
        {
            optionsContainer.style.display = optionsContainer.style.display === "block" ? "none" : "block";
        });

        // Populate options
        for (const [id, name] of Object.entries(optionsDictionary))
        {
            const option = document.createElement("div");
            option.textContent = name;
            option.addEventListener("click", async () =>
            {
                this.toggleLoader();
                const previousStorage = structuredClone(this.storage);

                // Update storage
                controllerParentObject[controllerParentObjectKey] = id;
                await chrome.storage.local.set(this.storage);
                await this.onStorageChange(previousStorage);

                // Remove selected class from all options
                optionsContainer.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));

                // Highlight selected option
                option.classList.add("selected");

                // Update displayed method name and close dropdown
                methodName.textContent = name;
                optionsContainer.style.display = "none";

                this.toggleLoader();
            });
            if (methodName.textContent === name) option.classList.add("selected");

            optionsContainer.appendChild(option);
        }
    }

    async createNotificationToggle(containerId)
    {
        const notificationsContainer = document.getElementById(containerId);
        if (!notificationsContainer) return;

        // Prevent double initialization
        if (notificationsContainer.querySelector("#notifications-button")) return;

        // Create flex container to hold the icon + dropdown wrapper
        const flexContainer = document.createElement("div");
        flexContainer.className = "flex-container";

        const methodLabel = notificationsContainer.querySelector(".method-label");
        notificationsContainer.insertBefore(flexContainer, methodLabel.nextSibling);

        // --- Create the bell icon button ---
        const svgPath = this.storage.isNotificationsOn ? "icons/bell.svg" : "icons/bell-slash.svg";
        const bellSvg = await fetch(svgPath).then(res => res.text());

        const notificationsButton = document.createElement("button");
        notificationsButton.id = "notifications-button";
        notificationsButton.className = "icon-button";
        notificationsButton.innerHTML = bellSvg;
        flexContainer.appendChild(notificationsButton);

        if (this.storage.isNotificationsOn)
            notificationsButton.classList.add("active");

        notificationsButton.addEventListener("click", async () =>
        {
            this.storage.isNotificationsOn = !this.storage.isNotificationsOn;
            const newSvgPath = this.storage.isNotificationsOn ? "icons/bell.svg" : "icons/bell-slash.svg";
            const newSvg = await fetch(newSvgPath).then(res => res.text());
            notificationsButton.innerHTML = newSvg;
            notificationsButton.classList.toggle("active");

            await chrome.storage.local.set({ isNotificationsOn: this.storage.isNotificationsOn });
            utils.timeLog("Toggled notifications to:", this.storage.isNotificationsOn);
        });

        // --- Move .method-select-wrapper next to the icon ---
        const methodSelectWrapper = notificationsContainer.querySelector(".method-select-wrapper");
        if (methodSelectWrapper)
        {
            notificationsContainer.removeChild(methodSelectWrapper);
            flexContainer.appendChild(methodSelectWrapper);
        }
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

    // TODO clean and save to storage
    async appendPrayerDisplayToggleButton()
    {
        // Check if already appended
        let displayToggleButton = document.getElementById("display-toggle");
        if (displayToggleButton) return;

        const container = document.createElement("div");
        container.className = "flex-container";

        const settingsSvg = await fetch("icons/align-justify-space-around.svg").then(res => res.text());
        displayToggleButton = document.createElement("button");
        displayToggleButton.id = "display-toggle";
        displayToggleButton.className = "icon-button";
        displayToggleButton.innerHTML = settingsSvg;
        displayToggleButton.addEventListener("click", () =>
        {
            const prayerElements = document.querySelectorAll(".prayer");
            prayerElements.forEach(el =>
            {
                el.classList.add("display-flex");
            });
        });

        const settings2Svg = await fetch("icons/align-space-around.svg").then(res => res.text());
        const displayToggleButton2 = document.createElement("button");
        displayToggleButton2.id = "display-toggle-2";
        displayToggleButton2.className = "icon-button";
        displayToggleButton2.innerHTML = settings2Svg;
        displayToggleButton2.addEventListener("click", () =>
        {
            const prayerElements = document.querySelectorAll(".prayer");
            prayerElements.forEach(el =>
            {
                el.classList.remove("display-flex");
            });
        });

        // Append
        container.append(displayToggleButton);
        container.append(displayToggleButton2);
        this.settingsPageGridContainer.appendChild(container);
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
    popupController.appendLogoIcon();
    popupController.appendSettingsButton();

    // Main Page
    if (popupController.storage && popupController.storage.prayerTimes)
    {
        const dailyPrayerTimes = popupController.getPrayerTimesByDate(new Date());
        popupController.displayPrayerTimes(dailyPrayerTimes);
    }

    // Settings Page
    popupController.appendLocationInput();
    const dropdowns = [
        { labelText: "Prayer Calculation Method", optionsDictionary: utils.PRAYER_CALCULATION_METHOD_IDS, controllerParentObject: popupController.storage.parameters, controllerParentObjectKey: "calculationMethodId" },
        { labelText: "Asr Jurisdiction Method", optionsDictionary: utils.ASR_JURISDICTION_METHOD_IDS, controllerParentObject: popupController.storage.parameters, controllerParentObjectKey: "asrMethodId" },
        { labelText: "Notifications Minutes Before", optionsDictionary: utils.NOTIFICATIONS_MINUTES_BEFORE_OPTIONS, controllerParentObject: popupController.storage, controllerParentObjectKey: "notificationsMinutesBefore", containerId: "notifications-container" },
    ];
    for (const config of dropdowns)
    {
        await popupController.appendDropdown(config);
    }
    popupController.createNotificationToggle("notifications-container");
    popupController.appendPrayerDisplayToggleButton();

    // Close dropdowns when clicking outside
    document.addEventListener("click", (event) =>
    {
        // Method dropdowns
        const dropdowns = document.querySelectorAll(".method-container");
        dropdowns.forEach(dropdown =>
        {
            const methodSelect = dropdown.querySelector(".method-select");
            const optionsContainer = dropdown.querySelector(".method-select-wrapper>.options");
            if (!methodSelect.contains(event.target) && !optionsContainer.contains(event.target))
            {
                optionsContainer.style.display = "none";
            }
        });

        // Location dropdown
        const locationContainer = document.querySelector(".location-container>.options");
        const locationSpan = document.querySelector(".location-name");
        if (!locationContainer.contains(event.target) && event.target !== locationSpan)
        {
            locationContainer.style.display = "none";
            locationSpan.contentEditable = false;
        }
    });
});