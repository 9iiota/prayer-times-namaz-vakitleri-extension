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
                chrome.storage.sync.set({ parameters }, () =>
                {
                    if (chrome.runtime.lastError)
                    {
                        // TODO: Normalize error handling throughout or function
                        console.error("❌ Failed to save:", chrome.runtime.lastError);
                    }
                    else
                    {
                        console.log(parameters);
                        console.log("✅ Saved parameters successfully!");
                    }
                });

                if (!countryCode || !postCode || !latitude || !longitude) return;

                await utils.getPrayerTimes(countryCode, postCode, latitude, longitude, methodSelect.value);
                utils.displayTimes(storage.prayerTimes);
            });
        });




        utils.displayTimes(prayerTimes);

        const locationResults = document.createElement("div");
        locationResults.style.position = "absolute";
        locationResults.style.background = "#fff";
        locationResults.style.border = "1px solid #ccc";
        locationResults.style.zIndex = "1000";
        // locationResults.style.display = "none"; // hide initially
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

        // TODO: handle saving
        citySpan.addEventListener("keydown", async (e) =>
        {
            if (e.key === "Enter")
            {
                e.preventDefault();
                const query = citySpan.textContent.trim();
                if (!query) return;

                // Nominatim API request
                try
                {
                    console.log("joe");
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`, {
                        headers: { "User-Agent": "PrayerTimesExtension/1.0 (GitHub: 9iiota)" }
                    });
                    const data = await res.json();

                    // Show results
                    locationResults.innerHTML = "";
                    if (data.length === 0)
                    {
                        console.log("jaaa");
                        const noRes = document.createElement("div");
                        noRes.textContent = "No results found";
                        locationResults.appendChild(noRes);
                    }
                    else
                    {
                        console.log(data);
                        data.forEach(place =>
                        {
                            const option = document.createElement("div");
                            option.textContent = place.display_name;
                            option.style.padding = "4px";
                            option.style.cursor = "pointer";

                            option.addEventListener("click", async () =>
                            {
                                console.log(place);
                                // Save selected location
                                citySpan.textContent = place.display_name;
                                const location = `${place.address.city}, ${place.address.country}`;
                                const coordinates = { lat: place.lat, lon: place.lon };

                                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${place.lat}&lon=${place.lon}&addressdetails=1`, {
                                    headers: { "User-Agent": "PrayerTimesExtension/1.0 (GitHub: 9iiota)" }
                                });
                                const data = await res.json();

                                const countryCode = data.address.country_code;
                                const postCode = data.address.postcode.split(" ")[0];
                                const parameters = { countryCode: countryCode, postCode: postCode, latitude: place.lat, longitude: place.lon, methodId: methodSelect.value };

                                chrome.storage.sync.set({ location, parameters }, () =>
                                {
                                    if (chrome.runtime.lastError)
                                    {
                                        console.error("❌ Failed to save:", chrome.runtime.lastError);
                                    }
                                    else
                                    {
                                        console.log("✅ Saved parameters successfully!");
                                    }
                                });

                                // locationResults.style.display = "none";
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

function getTimeDifference(startTime, endTime)
{
    // Convert HH:MM to total minutes
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    let diff = endTotal - startTotal;

    // If the difference is negative, assume it's the next day
    if (diff < 0) diff += 24 * 60;

    const diffH = Math.floor(diff / 60);
    const diffM = diff % 60;

    // Pad with leading zero if needed
    const pad = n => n.toString().padStart(2, '0');

    return `${pad(diffH)}: ${pad(diffM)}`;
}