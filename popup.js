import * as utils from "./utils.js";

class PopupController
{
    constructor(storage)
    {
        this.storage = storage;
        this.gridContainer = document.querySelector(".grid-container");

        // Listen for messages from background.js
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) =>
        {
            if (msg.action === "updatePrayerTimes")
            {
                // Update prayer times in popup is open
                this.onUpdatePrayerTimes(msg.data);
            }
        });
    }

    static async create()
    {
        const storage = await chrome.storage.local.get(null);
        return new PopupController(storage);
    }

    async fetchStorage()
    {
        this.storage = await chrome.storage.local.get(null);
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
        requestQueue = requestQueue.then(async () =>
        {
            const now = Date.now();
            const wait = Math.max(0, 2000 - (now - lastRequestTime)); // Enforce 2s interval between requests

            if (wait > 0)
            {
                utils.timeLog(`Scheduling Nominatim request. Will wait ${wait} ms before sending.`);
                await new Promise(res => setTimeout(res, wait));
            }
            lastRequestTime = Date.now();

            utils.timeLog("Sending Nominatim request now.");
            return func();
        });
        return requestQueue;
    }

    async fetchLocationResults(query)
    {
        return scheduleNominatimRequest(async () =>
        {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?
                format=json&
                q=${encodeURIComponent(query)}&
                addressdetails=1&
                limit=5`,
                { headers: { "User-Agent": "https://github.com/9iiota/prayer-times-namaz-vakitleri-extension" } }
            );
            if (!response.ok) throw new Error(`Nominatim request failed. Status: ${response.status}`);
            return response.json();
        });
    }

    formatLocation(address)
    {
        const cityTownVillage = address.city || address.town || address.village;
        const stateProvince = address.state || address.province;
        const country = address.country;

        const parts = [cityTownVillage, stateProvince, country];
        return parts.filter(Boolean).join(", ");
    }

    fetchAndStoreLocationDetails(locationResult)
    {
        return scheduleNominatimRequest(async () =>
        {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?
                    format=json&
                    lat=${encodeURIComponent(locationResult.lat)}&
                    lon=${encodeURIComponent(locationResult.lon)}&
                    addressdetails=1`,
                { headers: { "User-Agent": "https://github.com/9iiota/prayer-times-namaz-vakitleri-extension" } }
            );
            if (!response.ok) throw new Error(`Nominatim reverse request failed. Status: ${response.status}`);
            const data = await response.json();

            const zipCode = data.address.postcode?.split(" ")[0] ?? "";

            // Merge existing parameters with the new location data and coordinates
            // Any overlapping keys (e.g., city, state, country) from the new location
            // will overwrite the old values, while preserving all other existing parameters
            this.storage.parameters = { ...this.storage.parameters, ...this.formatLocation(locationResult.address), zipCode, latitude: locationResult.lat, longitude: locationResult.lon };
            await chrome.storage.local.set({ parameters: this.storage.parameters });
            utils.timeLog("Updated parameters with location:", this.storage.parameters);
        });
    }

    renderLocationResults(locationResults)
    {
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
                    const location = this.formatLocation(locationResult.address);
                    location.textContent = location;
                    location.contentEditable = false;
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
        const rect = locationSpan.getBoundingClientRect();
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

    rgbaArrayToHex(colorArray)
    {
        // Ensure at least RGB values are provided
        if (colorArray.length < 3)
        {
            return false;
        }

        // Extract RGB values, ignore alpha for hex conversion
        const [r, g, b] = colorArray;

        // Convert each component to a two-digit hex string and concatenate
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
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
                this.storage.isPrayed ? prayerContainer.classList.add("prayed") : prayerContainer.classList.remove("prayed");

                // Set background color based on badge background color
                // This ensures consistency between popup and badge colors
                const badgeBackgroundColor = this.rgbaArrayToHex(await chrome.action.getBadgeBackgroundColor({})).toLowerCase();
                prayerContainer.style.backgroundColor = badgeBackgroundColor === utils.COLORS.RED ? utils.COLORS.LIGHT_RED : badgeBackgroundColor === utils.COLORS.BLUE ? utils.COLORS.LIGHT_BLUE : utils.COLORS.LIGHT_GREEN;

                prayerContainer.addEventListener("click", async () =>
                {
                    this.storage.isPrayed = !this.storage.isPrayed;
                    await chrome.storage.local.set({ isPrayed: this.storage.isPrayed });
                    prayerContainer.classList.toggle("prayed");
                    utils.timeLog("Toggled isPrayed to:", this.storage.isPrayed);
                    // TODO update badge
                    const badgeBackgroundColor = this.rgbaArrayToHex(await chrome.action.getBadgeBackgroundColor({})).toLowerCase();
                    prayerContainer.style.backgroundColor = badgeBackgroundColor === utils.COLORS.RED ? utils.COLORS.LIGHT_RED : badgeBackgroundColor === utils.COLORS.BLUE ? utils.COLORS.LIGHT_BLUE : utils.COLORS.LIGHT_GREEN;
                });
            }
        }
    }

    onUpdatePrayerTimes(prayerTimes)
    {
        utils.timeLog("Received updatePrayerTimes message:", prayerTimes);
        const dailyPrayerTimes = this.getPrayerTimesByDate(prayerTimes, new Date());
        this.displayPrayerTimes(dailyPrayerTimes);
    }

}


document.addEventListener("DOMContentLoaded", async () =>
{
    const popupController = await PopupController.create();

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
    // document.addEventListener("click", (event) =>
    // {
    //     for (const [i, dropdown] of dropdowns.entries())
    //     {
    //         const methodSelect = document.querySelectorAll(".method-select")[i];
    //         const optionsContainer = document.querySelectorAll(".method-options")[i];
    //         if (!methodSelect.contains(event.target) && !optionsContainer.contains(event.target))
    //         {
    //             optionsContainer.style.display = "none";
    //         }
    //     }

    //     // Location dropdown
    //     const locationContainer = document.querySelector(".location-results");
    //     const locationSpan = document.querySelector(".location-name");
    //     if (!locationContainer.contains(event.target) && event.target !== locationSpan)
    //     {
    //         locationContainer.style.display = "none";
    //         locationSpan.contentEditable = false;
    //     }
    // });


    // const storage = await chrome.storage.local.get(null);
    // let { isPrayed, parameters, prayerTimes } = storage;

    // const dropdowns = [
    //     {
    //         labelText: "Prayer Calculation Method",
    //         optionsMap: utils.PRAYER_CALCULATION_METHOD_IDS,
    //         parameterKey: "calculationMethodId"
    //     },
    //     {
    //         labelText: "Asr Jurisdiction Method",
    //         optionsMap: utils.ASR_JURISDICTION_METHOD_IDS,
    //         parameterKey: "asrMethodId"
    //     }
    // ];

    // for (const config of dropdowns.reverse())
    // {
    //     await utils.setupDropdown(config);
    // }

    // const gridContainer = document.querySelector(".grid-container");
    // utils.setupLocationInput(gridContainer, parameters);

    // if (prayerTimes)
    // {
    //     const dailyPrayerTimes = utils.getPrayerTimesByDate(prayerTimes, new Date());
    //     utils.displayTimes(dailyPrayerTimes);
    // }

    // document.addEventListener("click", (event) =>
    // {
    //     dropdowns.forEach((dropdown, i) =>
    //     {
    //         const methodSelect = document.querySelectorAll(".method-select")[i];
    //         const optionsContainer = document.querySelectorAll(".method-options")[i];
    //         if (!methodSelect.contains(event.target) && !optionsContainer.contains(event.target))
    //         {
    //             optionsContainer.style.display = "none";
    //         }
    //     });

    //     // Location dropdown
    //     const locationContainer = document.querySelector(".location-results");
    //     const locationSpan = document.querySelector(".location-name");
    //     if (!locationContainer.contains(event.target) && event.target !== locationSpan)
    //     {
    //         locationContainer.style.display = "none";
    //         locationSpan.contentEditable = false;
    //     }
    // });
});