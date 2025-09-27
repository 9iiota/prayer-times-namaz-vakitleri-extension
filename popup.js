import * as utils from "./utils.js";

class PopupController
{
    constructor()
    {
        this.storage = null;
        this.fetchStorage();

        this.gridContainer = document.querySelector(".grid-container");

        // Setup dropdowns
        const dropdowns = [
            {
                labelText: "Prayer Calculation Method",
                optionsMap: utils.PRAYER_CALCULATION_METHOD_IDS,
                parameterKey: "calculationMethodId"
            },
            {
                labelText: "Asr Jurisdiction Method",
                optionsMap: utils.ASR_JURISDICTION_METHOD_IDS,
                parameterKey: "asrMethodId"
            }
        ];

        for (const config of dropdowns)
        {
            this.setupDropdown(config);
        }

        // TODO Setup location input


        // TODO Display prayer times


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
            this.storage.parameters[parameterKey] = id;
            await chrome.storage.local.set({ parameters: this.storage.parameters });
            utils.timeLog("Updated parameters:", this.storage.parameters);

            methodName.textContent = name;
            optionsContainer.style.display = "none";
        }
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

        for (const [name, i] of utils.PRAYER_NAMES.entries())
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
                const badgeBackgroundColor = rgbaArrayToHex(await chrome.action.getBadgeBackgroundColor({})).toLowerCase();
                div.style.backgroundColor = badgeBackgroundColor === utils.COLORS.RED ? utils.COLORS.LIGHT_RED : badgeBackgroundColor === utils.COLORS.BLUE ? utils.COLORS.LIGHT_BLUE : utils.COLORS.LIGHT_GREEN;

                // TODO add click listener
            }
        }
    }

    onUpdatePrayerTimes(prayerTimes)
    {
        utils.timeLog("Received updatePrayerTimes message:", prayerTimes);
        const dailyPrayerTimes = this.getPrayerTimesByDate(prayerTimes, new Date());
        utils.displayTimes(dailyPrayerTimes);
    }

}


document.addEventListener("DOMContentLoaded", async () =>
{
    // new PopupController();

    const storage = await chrome.storage.local.get(null);
    let { isPrayed, parameters, prayerTimes } = storage;

    const dropdowns = [
        {
            labelText: "Prayer Calculation Method",
            optionsMap: utils.PRAYER_CALCULATION_METHOD_IDS,
            parameterKey: "calculationMethodId"
        },
        {
            labelText: "Asr Jurisdiction Method",
            optionsMap: utils.ASR_JURISDICTION_METHOD_IDS,
            parameterKey: "asrMethodId"
        }
    ];

    for (const config of dropdowns.reverse())
    {
        await utils.setupDropdown(config);
    }

    const gridContainer = document.querySelector(".grid-container");
    utils.setupLocationInput(gridContainer, parameters);

    if (prayerTimes)
    {
        const dailyPrayerTimes = utils.getPrayerTimesByDate(prayerTimes, new Date());
        utils.displayTimes(dailyPrayerTimes);
    }

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