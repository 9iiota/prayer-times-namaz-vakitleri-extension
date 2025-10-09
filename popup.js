import * as utils from "./utils.js";
import { countryMap } from "./country-map.js";
import Fuse from "./libs/fuse.min.mjs";

class PopupController
{
    constructor(storage)
    {
        this.storage = storage;
        this.mainPageGridContainer = document.querySelectorAll(".grid-container")[0];
        this.settingsPageGridContainer = document.querySelectorAll(".grid-container")[1];
        this.lastRequestTime = 0;
        this.requestQueue = Promise.resolve();
        this.debugModeSequence = ["d", "e", "b", "u", "g", "m", "o", "d", "e"];
        this.sequenceIndex = 0;

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

    createLogoIcon()
    {
        let logoIcon = document.querySelector(".logo-icon");
        if (logoIcon) return; // Already created

        fetch("icons/icon.svg")
            .then(res => res.text())
            .then(svg =>
            {
                const logoIcon = document.createElement("div");
                logoIcon.className = "logo-icon";
                logoIcon.innerHTML = svg;

                const header = document.querySelector(".header");
                header.prepend(logoIcon);
            });
    }

    async createSettingsButton()
    {
        let settingsButton = document.getElementById("settings-button");
        if (settingsButton) return; // Already created

        // TODO clean code look at notificationstoggle
        await fetch("icons/settings.svg")
            .then(res => res.text())
            .then(svg =>
            {
                settingsButton = document.createElement("button");
                settingsButton.id = "settings-button";
                settingsButton.className = "icon-button";
                settingsButton.innerHTML = svg;
                settingsButton.addEventListener("click", () =>
                {
                    document.querySelector(".content").classList.toggle("show-settings");
                    settingsButton.classList.toggle("active");
                });

                const header = document.querySelector(".header");
                header.append(settingsButton);
            });

        if (!this.storage.prayerTimes)
        {
            document.querySelector(".content").classList.toggle("show-settings");
            settingsButton.classList.toggle("active");
        }
    }

    async setupDropdown({ labelText, optionsMap, parentObject, objectKey, containerId = null })
    {
        const methodContainer = document.createElement("div");
        if (containerId) methodContainer.id = containerId;
        methodContainer.className = "method-container";
        this.settingsPageGridContainer.appendChild(methodContainer);

        const methodLabel = document.createElement("span");
        methodLabel.className = "method-label";
        methodLabel.textContent = labelText;
        methodContainer.appendChild(methodLabel);

        const methodSelect = document.createElement("button");
        methodSelect.className = "method-select";
        methodContainer.appendChild(methodSelect);

        const methodName = document.createElement("span");
        methodName.className = "method-name";
        methodSelect.appendChild(methodName);

        const optionsContainer = document.createElement("div");
        optionsContainer.className = "options";
        methodContainer.appendChild(optionsContainer);

        // Set chosen option
        methodName.textContent = optionsMap[parentObject[objectKey]];

        // Toggle dropdown
        methodSelect.addEventListener("click", () =>
        {
            optionsContainer.style.display = optionsContainer.style.display === "block" ? "none" : "block";
        });

        // Populate options
        for (const [id, name] of Object.entries(optionsMap))
        {
            const option = document.createElement("div");
            option.textContent = name;
            option.addEventListener("click", async () =>
            {
                this.toggleLoadingSpinner();

                // Update storage with selected option
                const previouslySelectedId = parentObject[objectKey];
                if (previouslySelectedId === id)
                {
                    optionsContainer.style.display = "none";
                    this.toggleLoadingSpinner();
                    return;
                }

                const previousStorage = structuredClone(this.storage);

                parentObject[objectKey] = id;
                await chrome.storage.local.set(this.storage);

                await this.onStorageChanged(previousStorage);

                // Remove selected class from all options
                optionsContainer.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
                option.classList.add("selected");

                // Update displayed method name and close dropdown
                methodName.textContent = name;
                optionsContainer.style.display = "none";

                this.toggleLoadingSpinner();
            });

            if (methodName.textContent === name) option.classList.add("selected");

            optionsContainer.appendChild(option);
        }
    }

    async createNotificationToggle(containerId)
    {
        const notificationsContainer = document.getElementById(containerId);
        if (!notificationsContainer) return;

        const flexContainer = document.createElement("div");
        flexContainer.className = "flex-container";

        const methodLabel = notificationsContainer.querySelector(".method-label");
        notificationsContainer.insertBefore(flexContainer, methodLabel.nextSibling);

        let notificationsButton = notificationsContainer.querySelector("#notifications-button");
        if (notificationsButton) return; // Already created

        const svgPath = this.storage.isNotificationsOn ? "icons/bell.svg" : "icons/bell-slash.svg";
        const bellSvg = await fetch(svgPath).then(res => res.text());

        notificationsButton = document.createElement("button");
        notificationsButton.id = "notifications-button";
        notificationsButton.className = "icon-button";
        notificationsButton.innerHTML = bellSvg;
        flexContainer.appendChild(notificationsButton);

        if (this.storage.isNotificationsOn)
        {
            notificationsButton.classList.add("active");
        }

        notificationsButton.addEventListener("click", async () =>
        {
            const svgElement = notificationsButton.querySelector("svg");
            console.log(svgElement);
            if (!svgElement) return;

            // Toggle state + fetch new SVG
            this.storage.isNotificationsOn = !this.storage.isNotificationsOn;
            const newSvgPath = this.storage.isNotificationsOn ? "icons/bell.svg" : "icons/bell-slash.svg";
            const newSvg = await fetch(newSvgPath).then(res => res.text());
            notificationsButton.innerHTML = newSvg;
            notificationsButton.classList.toggle("active");

            // Update storage
            await chrome.storage.local.set({ isNotificationsOn: this.storage.isNotificationsOn });
            utils.timeLog("Toggled notifications to:", this.storage.isNotificationsOn);
        });

        const methodSelect = notificationsContainer.querySelector(".method-select");
        notificationsContainer.removeChild(methodSelect);
        flexContainer.appendChild(methodSelect);
    }

    scheduleNominatimRequest(func)
    {
        this.requestQueue = this.requestQueue.then(async () =>
        {
            const now = Date.now();
            const wait = Math.max(0, utils.NOMINATIM_REQUEST_INTERVAL_MS - (now - this.lastRequestTime)); // Enforce 2s interval between requests

            if (wait > 0)
            {
                utils.timeLog(`Scheduling Nominatim request. Will wait ${wait} ms before sending.`);
                await new Promise(res => setTimeout(res, wait));
            }
            this.lastRequestTime = Date.now();

            utils.timeLog("Sending Nominatim request now.");
            return func();
        });
        return this.requestQueue;
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

    formatLocation(address) // TODO maybe remove
    {
        const cityTownVillage = address.city || address.town || address.village;
        const stateProvince = address.state || address.province;
        const country = address.country;

        const parts = [cityTownVillage, stateProvince, country];
        return parts.filter(Boolean).join(", ");
    }

    toggleLoadingSpinner()
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

    fetchAndStoreLocationDetails(locationResult)
    {
        return this.scheduleNominatimRequest(async () =>
        {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(locationResult.lat)}&lon=${encodeURIComponent(locationResult.lon)}&addressdetails=1`,
                { headers: { "User-Agent": "https://github.com/9iiota/prayer-times-namaz-vakitleri-extension" } }
            );
            if (!response.ok) throw new Error(`Nominatim reverse request failed. Status: ${response.status}`);
            const data = await response.json();

            const zipCode = data.address.postcode?.split(" ")[0] ?? "";

            // Merge existing parameters with the new location data and coordinates
            // Any overlapping keys (e.g., city, state, country) from the new location
            // will overwrite the old values, while preserving all other existing parameters
            this.storage.parameters = { ...this.storage.parameters, countryCode: data.address.country_code, zipCode: zipCode, latitude: locationResult.lat, longitude: locationResult.lon, country: data.address.country, state: data.address.state || data.address.province || "", city: data.address.city || data.address.town || data.address.village || "" };
            await chrome.storage.local.set({ parameters: this.storage.parameters });
            utils.timeLog("Updated parameters with location:", this.storage.parameters);
        });
    }

    renderLocationResults(locationResults)
    {
        const locationName = document.querySelector(".location-name");
        const locationResultsContainer = document.querySelector(".location-container>.options");
        locationResultsContainer.innerHTML = "";

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
                const formattedLocationName = this.formatLocation(locationResult.address);
                const option = document.createElement("div");
                option.textContent = formattedLocationName;
                option.addEventListener("click", async () =>
                {
                    // Show loading spinner
                    this.toggleLoadingSpinner();

                    // Update storage with selected location
                    locationResultsContainer.style.display = "none";
                    locationName.textContent = formattedLocationName;
                    locationName.contentEditable = false;
                    try
                    {
                        await this.fetchAndStoreLocationDetails(locationResult);
                        utils.timeLog("Stored location details for:", locationResult);

                        // Fetch new prayer times with updated parameters
                        await this.onParametersChanged();
                    }
                    catch (error)
                    {
                        utils.timeLog("Error storing location details:", error);
                        // TODO maybe show an error message to the user
                    }

                    // Hide loading spinner
                    this.toggleLoadingSpinner();
                });
                locationResultsContainer.appendChild(option);
            }
        }
        locationResultsContainer.style.display = "block";
    }

    setupLocationInput()
    {
        const locationContainer = document.createElement("div");
        locationContainer.className = "location-container";
        this.settingsPageGridContainer.prepend(locationContainer);

        const locationName = document.createElement("span");
        locationName.className = "location-name";

        // Set location name
        if (this.storage.parameters.city && this.storage.parameters.country)
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
            document.execCommand("selectAll", false, null);
        });

        // Handle location name changes on enter key press
        locationName.addEventListener("keydown", async (event) =>
        {
            if (event.key !== "Enter") return;
            event.preventDefault();

            const newLocation = locationName.textContent.trim();
            if (newLocation.length === 0) return;

            try
            {
                const locationResults = await this.fetchLocationResults(newLocation);
                utils.timeLog("Fetched addresses:", locationResults);
                this.renderLocationResults(locationResults);
            }
            catch (error)
            {
                utils.timeLog("Error fetching location data:", error);
                // TODO maybe show an error message to the user
            }
        });
        locationContainer.appendChild(locationName);

        const optionsContainer = document.createElement("div");
        optionsContainer.className = "options";
        locationContainer.appendChild(optionsContainer);
    }

    getPrayerTimesByDate(prayerTimes, date)
    {
        const targetDate = new Date(date);
        const dateStr = targetDate.toISOString().split("T")[0];
        return prayerTimes.find(entry => entry.date === dateStr);
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
        const currentPrayerIndex = utils.getCurrentPrayerIndex(dailyPrayerTimes);

        // Clear old current-prayer ids
        document.querySelectorAll("#current-prayer").forEach(element =>
        {
            element.removeAttribute("id");
            element.style.backgroundColor = "";
        });

        for (const [index, name] of utils.PRAYER_NAMES.entries())
        {
            // Check if prayer container already exist in the DOM
            // If it does, only update the time and current-prayer id
            let prayerContainer = this.mainPageGridContainer.querySelectorAll(".prayer")[index];
            if (!prayerContainer)
            {
                // if (name === "Sun") prayerContainer.style.pointerEvents = "none"; // Disable pointer events for Sun
                // TODO fix

                // Create prayer elements
                prayerContainer = document.createElement("button");
                prayerContainer.className = "prayer";
                this.mainPageGridContainer.appendChild(prayerContainer);

                const nameSpan = document.createElement("span");
                nameSpan.className = "prayer-name";
                nameSpan.textContent = name;
                prayerContainer.appendChild(nameSpan);

                const timeSpan = document.createElement("span");
                timeSpan.className = "prayer-time";
                prayerContainer.appendChild(timeSpan);
            }

            // Update prayer time
            const timeSpan = prayerContainer.querySelector(".prayer-time");
            timeSpan.textContent = dailyPrayerTimes.times[index];

            // Highlight current prayer
            if (index === currentPrayerIndex)
            {
                prayerContainer.id = "current-prayer";
                this.updateCurrentPrayerBackgroundColor();

                prayerContainer.addEventListener("click", async () =>
                {
                    this.storage.isPrayed = !this.storage.isPrayed;
                    this.updateCurrentPrayerBackgroundColor();

                    await chrome.storage.local.set({ isPrayed: this.storage.isPrayed });
                    utils.timeLog("Toggled isPrayed to:", this.storage.isPrayed);
                });
            }
        }
    }

    fuzzySearch(query, options, threshold = 0.3)
    {
        if (!query || !options || options.length === 0) return null;

        const fuse = new Fuse(options, {
            keys: ["name"],
            threshold: threshold,
            includeScore: true,
        });

        const results = fuse.search(query, { limit: 1 });
        return results.length > 0 ? results[0].item : null;
    }

    async retrieveCityId(countryId, city, state)
    {
        // Fetch the country/state list
        const res = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/home/GetRegList?ChangeType=country&CountryId=${encodeURIComponent(countryId)}&Culture=en-US`);
        if (!res.ok) throw new Error('Network response not ok');
        const json = await res.json();

        let citiesList = [];

        if (json.HasStateList)
        {
            // Fallback to StateList if StateRegionList is null
            const states = json.StateList.map(item =>
            {
                const values = Object.values(item);
                return { name: values[2]?.trim(), id: values[3] };
            }).filter(item => item.name && item.id);

            const bestStateMatchObj = this.fuzzySearch(state || city, states); // { name: "", id: "" }
            if (!bestStateMatchObj) return null;

            const stateRes = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/home/GetRegList?ChangeType=state&CountryId=${encodeURIComponent(countryId)}&StateId=${encodeURIComponent(bestStateMatchObj.id)}&Culture=en-US`);
            if (!stateRes.ok) throw new Error('Network response not ok');
            const stateJson = await stateRes.json();
            citiesList = stateJson.StateRegionList || [];
        }
        else
        {
            citiesList = json.StateRegionList;
        }

        // Map cities to simplified objects
        const cities = citiesList.map(item =>
        {
            const values = Object.values(item);
            return { name: values[values.length - 2]?.trim(), id: values[values.length - 1] };
        }).filter(item => item.name && item.id);

        // Fuzzy search for best city match
        const bestCityMatch = this.fuzzySearch(city, cities);
        return bestCityMatch?.id || null;
    }

    async onStorageChanged(previousStorage)
    {
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

        for (const key of Object.keys(changed))
        {
            switch (key)
            {
                // case "isPrayed":
                //     console.log("isPrayed changed:", this.storage.isPrayed);
                //     break;

                case "parameters":
                    utils.timeLog(`Parameters changed from `, previousStorage.parameters, "to", this.storage.parameters);
                    await this.onParametersChanged();
                    break;

                // case "prayerTimes":
                //     console.log("Prayer times changed:", this.storage.prayerTimes.length, "entries");
                //     break;

                case "isNotificationsOn":
                    console.log("Notification toggle changed:", this.storage.isNotificationsOn);
                    break;

                default:
                    console.log(`Unhandled change in key: ${key}`);
                    break;
            }
        }

        return changed;
    }

    async onParametersChanged()
    {
        let prayerTimes = [];
        // Try to scrape from https://namazvakitleri.diyanet.gov.tr/ first
        // because the API times are usually off by a few minutes compared to the official site
        if (this.storage.parameters.calculationMethodId === "13"
            && this.storage.parameters.asrMethodId === "0"
            && this.storage.parameters.country
            && this.storage.parameters.city
        )
            try
            {
                utils.timeLog('Fetching prayer times from official site...');
                const countryId = Object.keys(countryMap).find(key => countryMap[key] === this.storage.parameters.country);
                if (!countryId) throw new Error(`Country not found in countryMap: ${this.storage.parameters.country}`);

                const cityId = await this.retrieveCityId(countryId, this.storage.parameters.city, this.storage.parameters.state);
                if (!cityId) throw new Error(`City not found: ${this.storage.parameters.city} in country: ${this.storage.parameters.country}`);

                const response = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/${encodeURIComponent(cityId)}`);
                if (!response.ok) throw new Error(`Failed to fetch prayer times from official site. Status: ${response.status}`);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const days = doc.querySelectorAll("#tab-1 > div > table > tbody > tr");
                days.forEach(day =>
                {
                    const children = day.children;
                    const dateStr = children[0].textContent.trim();
                    const [d, m, y] = dateStr.split(".");
                    const date = new Date(y, m - 1, d, 12);

                    const timeTds = Array.from(children).slice(2);
                    const times = timeTds.map(cell => cell.textContent.trim());

                    prayerTimes.push({
                        date: date.toISOString().split("T")[0],
                        times
                    });
                });

                const todayStr = new Date().toISOString().split("T")[0];
                prayerTimes = prayerTimes.filter(entry => entry.date >= todayStr);

                if (prayerTimes.length === 0) throw new Error('No prayer times found from official site.');
                await chrome.storage.local.set({ prayerTimes });
                utils.timeLog('Fetched and stored prayer times from official site:', prayerTimes);
                this.updatePrayerTimes(prayerTimes);
                return;
            }
            catch (error)
            {
                console.error('Error fetching prayer times from official site:', error);
            }

        // If scraping from official site failed, fall back to using the API
        try
        {
            const response = await fetch(
                `https://www.islamicfinder.us/index.php/api/prayer_times?show_entire_month&country=${encodeURIComponent(this.storage.parameters.countryCode)}&zipcode=${encodeURIComponent(this.storage.parameters.zipCode)}&latitude=${encodeURIComponent(this.storage.parameters.latitude)}&longitude=${encodeURIComponent(this.storage.parameters.longitude)}&method=${encodeURIComponent(this.storage.parameters.calculationMethodId)}&juristic=${encodeURIComponent(this.storage.parameters.asrMethodId)}&time_format=0`
            );
            if (!response.ok) throw new Error(`Failed to fetch prayer times from API. Status: ${response.status}`);
            const json = await response.json();

            const todayStr = new Date().toISOString().split("T")[0];
            prayerTimes = Object.entries(json.results).map(([date, times]) => ({
                date: date.replace(/-(\d)$/, "-0$1"), // Pad single digit days with leading zero
                times: [times.Fajr, times.Duha, times.Dhuhr, times.Asr, times.Maghrib, times.Isha]
            })).filter(entry => entry.date >= todayStr);

            if (prayerTimes.length === 0) throw new Error('No prayer times found from API.');

            await chrome.storage.local.set({ prayerTimes });
            utils.timeLog('Fetched and stored prayer times from API:', prayerTimes);
            this.updatePrayerTimes(prayerTimes);
            return;
        }
        catch (error)
        {
            console.error('Error fetching prayer times from API:', error);
            return;
        }
    }

    getPrayerTimesByDate(prayerTimes, date)
    {
        const targetDate = new Date(date);
        const dateStr = targetDate.toISOString().split("T")[0];
        return prayerTimes.find(entry => entry.date === dateStr);
    }

    updatePrayerTimes(prayerTimes)
    {
        const dailyPrayerTimes = this.getPrayerTimesByDate(prayerTimes, new Date());
        this.displayPrayerTimes(dailyPrayerTimes);
    }

    onKeydown(event)
    {
        const key = event.key;
        if (key === this.debugModeSequence[this.sequenceIndex])
        {
            this.sequenceIndex++;

            if (this.sequenceIndex === this.debugModeSequence.length)
            {
                this.sequenceIndex = 0;
                console.log("Debug mode activated!");
                const prayers = document.querySelectorAll(".prayer");
                prayers.forEach(prayer =>
                {
                    prayer.style.display = prayer.style.display === "block" ? "flex" : "block";
                });

                // TODO: Activate debug mode

                // let duoContainer = document.querySelector(".duo-container");
                // if (!duoContainer)
                // {
                //     duoContainer = document.createElement("div");
                //     duoContainer.className = "duo-container";

                //     const rightContainer = document.createElement("div");
                //     duoContainer.appendChild(rightContainer);

                //     const popupContainer = document.querySelector(".popup-container");
                //     popupContainer.appendChild(duoContainer);

                //     const gridContainer = document.querySelector(".grid-container");
                //     duoContainer.appendChild(gridContainer);
                // }
            }
        }
        else
        {
            // Reset if the sequence is broken
            // Also handle the case where the first key of the sequence is pressed again
            this.sequenceIndex = key === this.debugModeSequence[0] ? 1 : 0;
        }
    }
}

document.addEventListener("DOMContentLoaded", async () =>
{
    const popupController = await PopupController.init();

    popupController.createLogoIcon();
    popupController.createSettingsButton();

    popupController.setupLocationInput();

    const dropdowns = [
        { labelText: "Prayer Calculation Method", optionsMap: utils.PRAYER_CALCULATION_METHOD_IDS, parentObject: popupController.storage.parameters, objectKey: "calculationMethodId" },
        { labelText: "Asr Jurisdiction Method", optionsMap: utils.ASR_JURISDICTION_METHOD_IDS, parentObject: popupController.storage.parameters, objectKey: "asrMethodId" },
        { labelText: "Notifications Minutes Before", optionsMap: utils.NOTIFICATIONS_MINUTES_BEFORE_OPTIONS, parentObject: popupController.storage, objectKey: "notificationsMinutesBefore", containerId: "notifications-container" },
    ];
    for (const config of dropdowns)
    {
        await popupController.setupDropdown(config);
    }

    popupController.createNotificationToggle("notifications-container");

    if (popupController.storage && popupController.storage.prayerTimes)
    {
        const dailyPrayerTimes = popupController.getPrayerTimesByDate(popupController.storage.prayerTimes, new Date());
        popupController.displayPrayerTimes(dailyPrayerTimes);
    }

    // Close dropdowns when clicking outside
    document.addEventListener("click", (event) =>
    {
        dropdowns.forEach((dropdown, i) =>
        {
            const methodSelect = document.querySelectorAll(".method-select")[i];
            const optionsContainer = document.querySelectorAll(".method-container>.options")[i];
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

    document.addEventListener("keydown", (event) =>
    {
        popupController.onKeydown(event);
    });
});