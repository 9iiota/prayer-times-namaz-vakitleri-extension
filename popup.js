import * as utils from "./utils.js";

document.addEventListener("DOMContentLoaded", () =>
{
    chrome.storage.sync.get(["location", "parameters", "prayerTimes"], async (storage) =>
    {
        const { location, parameters, prayerTimes } = storage;

        // Prayer time calculation method select
        const methodSelect = document.querySelector("#method-select");
        methodSelect.value = parameters.methodId;
        methodSelect.addEventListener("change", async () =>
        {
            chrome.storage.sync.get(["parameters"], async (storage) =>
            {
                if (chrome.runtime.lastError)
                {
                    // TODO: Normalize error handling throughout or function
                    console.error("❌ Failed to get storage:", chrome.runtime.lastError);
                    return;
                }

                let { countryCode, postCode, latitude, longitude, methodId } = storage.parameters;
                methodId = methodSelect.value;

                const parameters = { countryCode, postCode, latitude, longitude, methodId };
                utils.saveToStorage("parameters", parameters);

                if (!countryCode || !postCode || !latitude || !longitude) return;

                const prayerTimes = await utils.getPrayerTimes(countryCode, postCode, latitude, longitude, methodSelect.value);
                utils.saveToStorage("prayerTimes", prayerTimes);
                utils.displayTimes(prayerTimes);
            });
        });

        utils.displayTimes(prayerTimes);

        const locationResults = document.createElement("div");
        locationResults.className = "location-results";
        document.body.appendChild(locationResults);

        const citySpan = document.querySelector("#city");
        citySpan.textContent = location || "Click to set location";
        citySpan.addEventListener("click", () =>
        {
            citySpan.contentEditable = true;
            citySpan.focus();
            document.execCommand('selectAll', false, null);
        });
        citySpan.addEventListener("blur", () =>
        {
            // delay hiding results to allow click
            setTimeout(() =>
            {
                citySpan.contentEditable = false;
                // locationResults.style.display = "none";
            }, 200);
        });
        citySpan.addEventListener("keydown", async (e) =>
        {
            // TODO: handle saving
            if (e.key === "Enter")
            {
                e.preventDefault();
                const query = citySpan.textContent.trim();
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
                            option.style.padding = "4px";
                            option.style.cursor = "pointer";

                            option.addEventListener("click", async () =>
                            {
                                // Save selected location
                                const location = `${place.address.city || place.address.town}, ${place.address.country}`;
                                citySpan.textContent = location;

                                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${place.lat}&lon=${place.lon}&addressdetails=1`, {
                                    headers: { "User-Agent": "PrayerTimesExtension/1.0 (GitHub: 9iiota)" }
                                });
                                const data = await res.json();

                                const countryCode = data.address.country_code;
                                const postCode = data.address.postcode.split(" ")[0];
                                const parameters = { countryCode: countryCode, postCode: postCode, latitude: place.lat, longitude: place.lon, methodId: methodSelect.value };

                                utils.saveToStorage({
                                    location: location,
                                    parameters: parameters
                                });

                                locationResults.style.display = "none";

                                const prayerTimes = await utils.getPrayerTimes(countryCode, postCode, place.lat, place.lon, methodSelect.value);
                                utils.saveToStorage("prayerTimes", prayerTimes);
                                utils.displayTimes(prayerTimes);
                            });

                            locationResults.appendChild(option);
                        });
                    }

                    // Position results under the span
                    const rect = citySpan.getBoundingClientRect();
                    locationResults.style.top = `${rect.bottom + window.scrollY}px`;
                    locationResults.style.left = `${rect.left + window.scrollX}px`;
                    locationResults.style.width = `${rect.width}px`;
                    locationResults.style.display = "block";

                }
                catch (err)
                {
                    console.error(err);
                }
            }
        });
    });
});