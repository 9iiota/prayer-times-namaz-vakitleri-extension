import * as utils from "./utils.js";

document.addEventListener("DOMContentLoaded", async () =>
{
    const storage = await utils.getFromStorage(["parameters", "prayerTimes"]);
    let { parameters, prayerTimes } = storage;

    const dropdowns = [
        {
            containerSelector: "#calculation-methods",
            selectSelector: "#calculation-select",
            spanSelector: "#calculation-span",
            optionsMap: utils.PRAYER_CALCULATION_METHOD_IDS,
            parameterKey: "calculationMethodId"
        },
        {
            containerSelector: "#jurisdiction-methods",
            selectSelector: "#jurisdiction-select",
            spanSelector: "#jurisdiction-span",
            optionsMap: utils.ASR_JURISDICTION_METHOD_IDS,
            parameterKey: "asrMethodId"
        }
    ];

    for (const config of dropdowns)
    {
        utils.setupDropdown(config);
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
        dropdowns.forEach(({ containerSelector, selectSelector }) =>
        {
            const container = document.querySelector(containerSelector);
            const select = document.querySelector(selectSelector);
            if (!container.contains(event.target) && !select.contains(event.target))
            {
                container.style.display = "none";
            }
        });

        // Location dropdown
        const locationContainer = document.querySelector(".location-results");
        const locationSpan = document.querySelector(".location");
        if (!locationContainer.contains(event.target) && event.target !== locationSpan)
        {
            locationContainer.style.display = "none";
            locationSpan.contentEditable = false;
        }
    });
});