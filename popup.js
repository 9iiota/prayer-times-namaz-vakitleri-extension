import * as utils from "./utils.js";

document.addEventListener("DOMContentLoaded", async () =>
{
    const storage = await utils.getFromStorage(["parameters", "prayerTimes"]);
    let { parameters, prayerTimes } = storage;

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