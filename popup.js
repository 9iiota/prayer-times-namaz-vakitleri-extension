import * as utils from "./utils.js";

document.addEventListener("DOMContentLoaded", async () =>
{
    const storage = await utils.getFromStorage(["parameters", "prayerTimes"]);
    let { parameters, prayerTimes } = storage;

    // Prayer Calculation Method Dropdown
    utils.setupDropdown({
        containerSelector: "#calculation-methods",
        selectSelector: "#calculation-select",
        spanSelector: "#calculation-span",
        optionsMap: utils.PRAYER_CALCULATION_METHOD_IDS,
        parameterKey: "methodId"
    });

    // Asr Jurisdiction Method Dropdown
    utils.setupDropdown({
        containerSelector: "#jurisdiction-methods",
        selectSelector: "#jurisdiction-select",
        spanSelector: "#jurisdiction-span",
        optionsMap: utils.ASR_JURISDICTION_METHOD_IDS,
        parameterKey: "asrMethodId"
    });

    if (prayerTimes)
    {
        utils.displayTimes(prayerTimes);
    }

    const gridContainer = document.querySelector(".grid-container");
    const locationResults = document.createElement("div");
    locationResults.className = "location-results";
    gridContainer.appendChild(locationResults);

    const locationSpan = document.querySelector(".location");
    if (parameters.city && parameters.country)
    {
        locationSpan.textContent = parameters.state ? `${parameters.city}, ${parameters.state}, ${parameters.country}` : `${parameters.city}, ${parameters.country}`;
    }
    else
    {
        locationSpan.textContent = "Click to set location";
    }
    locationSpan.addEventListener("click", () =>
    {
        locationSpan.contentEditable = true;
        locationSpan.focus();
        document.execCommand('selectAll', false, null);
    });
    locationSpan.addEventListener("keydown", async (e) =>
    {
        // TODO: handle saving
        if (e.key === "Enter")
        {
            e.preventDefault();
            const query = locationSpan.textContent.trim();
            if (!query) return;

            // Nominatim API request
            try
            {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`, {
                    headers: { "User-Agent": "PrayerTimesExtension/1.0 (GitHub: 9iiota)" }
                });
                const data = await res.json();

                // Show results
                locationResults.innerHTML = "";
                if (data.length === 0)
                {
                    const noRes = document.createElement("div");
                    noRes.textContent = "No results found";
                    locationResults.appendChild(noRes);
                }
                else
                {
                    data.forEach(place =>
                    {
                        const option = document.createElement("div");
                        option.textContent = place.display_name;

                        option.addEventListener("click", async () =>
                        {
                            // Save selected location
                            const country = place.address.country || "";
                            const state = place.address.state || place.address.province || "";
                            const city = place.address.city || place.address.town || place.address.village || "";
                            const location = [city, state, country]
                                .filter(part => part && part.trim() !== "")
                                .join(", ");
                            locationSpan.textContent = location;

                            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${place.lat}&lon=${place.lon}&addressdetails=1`, {
                                headers: { "User-Agent": "PrayerTimesExtension/1.0 (GitHub: 9iiota)" }
                            });
                            const data = await res.json();

                            const zipCode = data.address.postcode.split(" ")[0];
                            parameters = { countryCode: data.address.country_code, zipCode: zipCode, latitude: place.lat, longitude: place.lon, methodId: parameters.methodId, asrMethodId: parameters.asrMethodId, country: place.address.country, state: place.address.state || place.address.province, city: place.address.city || place.address.town };
                            utils.saveToStorage("parameters", parameters);

                            const prayerTimes = await utils.fetchPrayerTimes(parameters.countryCode, parameters.zipCode, parameters.latitude, parameters.longitude, parameters.methodId, parameters.asrMethodId, parameters.country, parameters.state || place.address.province, parameters.city);
                            utils.saveToStorage("prayerTimes", prayerTimes);
                            utils.displayTimes(prayerTimes);

                            locationResults.style.display = "none";
                        });

                        locationResults.appendChild(option);
                    });
                }

                // Position results under the span
                const rect = locationSpan.getBoundingClientRect();
                if (!document.querySelector(".prayer"))
                {
                    locationResults.style.position = "relative";
                    locationResults.style.top = "none";
                }
                else
                {
                    locationResults.style.top = `${rect.bottom + window.scrollY}px`;
                }
                locationResults.style.display = "block";
            }
            catch (err)
            {
                console.error(err);
            }
        }
    });

    const calculationContainer = document.querySelector("#calculation-methods");
    const calculationSelect = document.querySelector("#calculation-select");
    const jurisdictionContainer = document.querySelector("#jurisdiction-methods");
    const jurisdictionSelect = document.querySelector("#calculation-select");
    const locationContainer = document.querySelector(".location-results");
    document.addEventListener("click", (event) =>
    {
        // Close prayer calculation method dropdown if clicked outside
        if (!calculationContainer.contains(event.target) && !calculationSelect.contains(event.target))
        {
            calculationContainer.style.display = "none";
        }

        // Close asr jurisdiction method dropdown if clicked outside
        if (!jurisdictionContainer.contains(event.target) && !jurisdictionSelect.contains(event.target))
        {
            jurisdictionContainer.style.display = "none";
        }

        // Close location results if clicked outside
        if (!locationContainer.contains(event.target) && event.target !== locationSpan)
        {
            locationContainer.style.display = "none";
            locationSpan.contentEditable = false;
        }
    });
});