import * as utils from "./utils.js";
import { countryMap } from "./country-map.js";
import Fuse from "./libs/fuse.min.mjs";

class PopupController
{
    constructor(storage)
    {
        this.storage = storage;
        this.gridContainer = document.querySelector(".grid-container");
        this.lastRequestTime = 0;
        this.requestQueue = Promise.resolve();

        // Listen for messages from background.js
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) =>
        {
            switch (msg.action)
            {
                case "parametersChanged":
                    this.onParametersChanged(msg.data);
                    break;
                case "prayerChanged":
                    this.displayPrayerTimes(msg.data);
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

    async setupDropdown({ labelText, optionsMap, parameterKey })
    {
        const methodContainer = document.createElement("div");
        methodContainer.className = "method-container";
        this.gridContainer.appendChild(methodContainer);

        const methodLabel = document.createElement("span");
        methodLabel.className = "method-label";
        methodLabel.textContent = labelText;
        methodContainer.appendChild(methodLabel);

        const methodSelect = document.createElement("div");
        methodSelect.className = "method-select";
        methodContainer.appendChild(methodSelect);

        const methodName = document.createElement("span");
        methodName.className = "method-name";
        methodSelect.appendChild(methodName);

        const optionsContainer = document.createElement("div");
        optionsContainer.className = "method-options";
        methodContainer.appendChild(optionsContainer);

        // Set chosen option
        methodName.textContent = optionsMap[this.storage.parameters[parameterKey]];

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
                this.storage.parameters[parameterKey] = id;
                await chrome.storage.local.set({ parameters: this.storage.parameters });
                utils.timeLog("Updated parameters:", this.storage.parameters);
                methodName.textContent = name;
                optionsContainer.style.display = "none";
            });
            optionsContainer.appendChild(option);
        }
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
        const locationResultsContainer = document.querySelector(".location-results");
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
                const option = document.createElement("div");
                option.textContent = locationResult.display_name;
                option.addEventListener("click", async () =>
                {
                    // Update storage with selected location
                    locationResultsContainer.style.display = "none";
                    const formattedLocationName = this.formatLocation(locationResult.address);
                    locationName.textContent = formattedLocationName;
                    locationName.contentEditable = false;
                    try
                    {
                        await this.fetchAndStoreLocationDetails(locationResult);
                        utils.timeLog("Stored location details for:", locationResult);
                    }
                    catch (error)
                    {
                        utils.timeLog("Error storing location details:", error);
                        // TODO maybe show an error message to the user
                    }
                });
                locationResultsContainer.appendChild(option);
            }
        }

        // Position results container below the location span
        // Regardless of whether prayers are in the DOM or not
        const rect = locationName.getBoundingClientRect();
        if (!document.querySelector(".prayer"))
        {
            locationResultsContainer.style.position = "relative";
            locationResultsContainer.style.top = "auto";
        }
        else
        {
            locationResultsContainer.style.position = "absolute";
            locationResultsContainer.style.top = `${rect.bottom + window.scrollY}px`;
        }
        locationResultsContainer.style.display = "block";
    }

    setupLocationInput()
    {
        const dropdowns = document.querySelectorAll(".method-container");
        const lastDropdown = dropdowns[dropdowns.length - 1];

        const locationContainer = document.createElement("div");
        locationContainer.className = "location-container";
        lastDropdown.after(locationContainer);

        const locationName = document.createElement("span");
        locationName.className = "location-name";

        // Set location name
        if (this.storage.parameters.city && this.storage.parameters.country)
        {
            if (this.storage.parameters.state)
            {
                locationName.textContent = `${this.storage.parameters.city}, ${this.storage.parameters.state}, ${this.storage.parameters.country}`;
            } else
            {
                locationName.textContent = `${this.storage.parameters.city}, ${this.storage.parameters.country}`;
            }
        }
        else
        {
            locationName.textContent = "Click to type location";
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

        const locationResults = document.createElement("div");
        locationResults.className = "location-results";
        locationContainer.appendChild(locationResults);

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
            const sunContainer = document.querySelector(".prayer:nth-of-type(5)");
            if (currentPrayerContainer === sunContainer)
            {
                // Sun can't be clicked
                currentPrayerContainer.style.backgroundColor = utils.COLORS.LIGHT_GRAY;
            }
            else if (this.storage.isPrayed)
            {
                currentPrayerContainer.style.backgroundColor = utils.COLORS.LIGHT_GREEN;
            }
            else
            {
                const badgeText = await chrome.action.getBadgeText({});
                currentPrayerContainer.style.backgroundColor = badgeText.includes("m") ? utils.COLORS.LIGHT_RED : utils.COLORS.LIGHT_BLUE;
            }
        }
    }

    async displayPrayerTimes(dailyPrayerTimes)
    {
        const currentPrayerIndex = utils.getCurrentPrayerIndex(dailyPrayerTimes);

        // Clear old current-prayer ids
        document.querySelectorAll("#current-prayer").forEach(el => el.removeAttribute("id"));

        for (const [i, name] of utils.PRAYER_NAMES.entries())
        {
            // Check if prayer container already exist in the DOM
            // If it does, only update the time and current-prayer id
            let prayerContainer = this.gridContainer.querySelectorAll(".prayer")[i];
            if (!prayerContainer)
            {
                // Create prayer elements
                prayerContainer = document.createElement("div");
                prayerContainer.className = "prayer";
                this.gridContainer.appendChild(prayerContainer);

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
            timeSpan.textContent = dailyPrayerTimes.times[i];

            // Highlight current prayer
            if (i === currentPrayerIndex)
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

    async onParametersChanged(newParamaters)
    {
        let prayerTimes = [];
        // Try to scrape from https://namazvakitleri.diyanet.gov.tr/ first
        // because the API times are usually off by a few minutes compared to the official site
        if (newParamaters.calculationMethodId === "13"
            && newParamaters.asrMethodId === "0"
            && newParamaters.country
            && newParamaters.city
        )
            try
            {
                utils.timeLog('Fetching prayer times from official site...');
                const countryId = Object.keys(countryMap).find(key => countryMap[key] === newParamaters.country);
                if (!countryId) throw new Error(`Country not found in countryMap: ${newParamaters.country}`);

                const cityId = await this.retrieveCityId(countryId, newParamaters.city, newParamaters.state);
                if (!cityId) throw new Error(`City not found: ${newParamaters.city} in country: ${newParamaters.country}`);

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
                `https://www.islamicfinder.us/index.php/api/prayer_times?show_entire_month&country=${encodeURIComponent(newParamaters.countryCode)}&zipcode=${encodeURIComponent(newParamaters.zipCode)}&latitude=${encodeURIComponent(newParamaters.latitude)}&longitude=${encodeURIComponent(newParamaters.longitude)}&method=${encodeURIComponent(newParamaters.calculationMethodId)}&juristic=${encodeURIComponent(newParamaters.asrMethodId)}&time_format=0`
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
}

document.addEventListener("DOMContentLoaded", async () =>
{
    const popupController = await PopupController.init();

    const dropdowns = [
        { labelText: "Prayer Calculation Method", optionsMap: utils.PRAYER_CALCULATION_METHOD_IDS, parameterKey: "calculationMethodId" },
        { labelText: "Asr Jurisdiction Method", optionsMap: utils.ASR_JURISDICTION_METHOD_IDS, parameterKey: "asrMethodId" }
    ];

    for (const config of dropdowns)
    {
        await popupController.setupDropdown(config);
    }

    popupController.setupLocationInput();

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
            const optionsContainer = document.querySelectorAll(".method-options")[i];
            if (!methodSelect.contains(event.target) && !optionsContainer.contains(event.target))
            {
                optionsContainer.style.display = "none";
            }
        });

        // Location dropdown
        const locationContainer = document.querySelector(".location-results");
        const locationSpan = document.querySelector(".location-name");
        if (!locationContainer.contains(event.target) && event.target !== locationSpan)
        {
            locationContainer.style.display = "none";
            locationSpan.contentEditable = false;
        }
    });
});