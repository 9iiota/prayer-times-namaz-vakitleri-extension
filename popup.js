import * as utils from "./utils.js";

document.addEventListener("DOMContentLoaded", async () =>
{
    const storage = await utils.getFromStorage(["parameters", "prayerTimes"]);
    let { parameters, prayerTimes } = storage;

    const methods = {
        0: "Jafari - Ithna Ashari",
        1: "Karachi - University of Islamic Sciences",
        2: "ISNA - Islamic Society of North America",
        3: "MWL - Muslim World League",
        4: "Mecca - Umm al-Qura",
        5: "Egyptian General Authority of Survey",
        7: "University of Tehran - Institute of Geophysics",
        8: "Algerian Minister of Religious Affairs and Wakfs",
        9: "Gulf 90 Minutes Fixed Isha",
        10: "Egyptian General Authority of Survey (Bis)",
        11: "UOIF - Union Des Organisations Islamiques De France",
        12: "Sistem Informasi Hisab Rukyat Indonesia",
        13: "Diyanet İşleri Başkanlığı"
    };

    const methodSelect = document.querySelector(".test-method-select");
    const methodSpan = document.querySelector(".test-method");
    console.log(parameters);
    methodSpan.textContent = methods[parameters.methodId];

    const methodsList = document.querySelector(".methods");
    Object.entries(methods).forEach(([id, name]) =>
    {
        const option = document.createElement("div");
        option.textContent = name;

        // Save selected method, recalculate prayer times and update display
        option.addEventListener("click", async () =>
        {
            parameters.methodId = id;
            utils.saveToStorage("parameters", parameters);
            methodSpan.textContent = methods[id];
            methodsList.style.display = "none";

            const prayerTimes = await utils.getPrayerTimes(parameters.countryCode, parameters.postCode, parameters.latitude, parameters.longitude, parameters.methodId, parameters.country, parameters.state, parameters.city);
            utils.saveToStorage("prayerTimes", prayerTimes);
            utils.displayTimes(prayerTimes);
        });

        methodsList.appendChild(option);
    });

    methodSelect.addEventListener("click", () =>
    {
        methodsList.style.display = methodsList.style.display === "block" ? "none" : "block";
    });

    if (prayerTimes)
    {
        utils.displayTimes(prayerTimes);
    }

    const locationResults = document.createElement("div");
    locationResults.className = "location-results";
    document.body.appendChild(locationResults);

    const citySpan = document.querySelector("#city");
    if (parameters.city && parameters.country)
    {
        citySpan.textContent = parameters.state ? `${parameters.city}, ${parameters.state}, ${parameters.country}` : `${parameters.city}, ${parameters.country}`;
    }
    else
    {
        citySpan.textContent = "Click to set location";
    }
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

                        option.addEventListener("click", async () =>
                        {
                            // Save selected location
                            const location = place.address.state ? `${place.address.city || place.address.town}, ${place.address.state}, ${place.address.country}` : `${place.address.city || place.address.town}, ${place.address.country}`;
                            citySpan.textContent = location;

                            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${place.lat}&lon=${place.lon}&addressdetails=1`, {
                                headers: { "User-Agent": "PrayerTimesExtension/1.0 (GitHub: 9iiota)" }
                            });
                            const data = await res.json();

                            const postCode = data.address.postcode.split(" ")[0];
                            parameters = { countryCode: data.address.country_code, postCode: postCode, latitude: place.lat, longitude: place.lon, methodId: parameters.methodId, country: place.address.country, state: place.address.state || place.address.province, city: place.address.city || place.address.town };
                            console.log(parameters);
                            utils.saveToStorage({
                                parameters: parameters
                            });

                            const prayerTimes = await utils.getPrayerTimes(parameters.countryCode, parameters.postCode, parameters.latitude, parameters.longitude, parameters.methodId, parameters.country, parameters.state || place.address.province, parameters.city);
                            utils.saveToStorage("prayerTimes", prayerTimes);
                            utils.displayTimes(prayerTimes);

                            locationResults.style.display = "none";
                        });

                        locationResults.appendChild(option);
                    });
                }

                // Position results under the span
                const rect = citySpan.getBoundingClientRect();
                locationResults.style.top = `${rect.bottom + window.scrollY}px`;
                locationResults.style.display = "block";
            }
            catch (err)
            {
                console.error(err);
            }
        }
    });

    document.addEventListener("click", (event) =>
    {
        // Close prayer calculation method dropdown if clicked outside
        if (!methodsList.contains(event.target) && !methodSelect.contains(event.target))
        {
            methodsList.style.display = "none";
        }

        // Close location results if clicked outside
        if (!locationResults.contains(event.target) && event.target !== citySpan)
        {
            locationResults.style.display = "none";
            citySpan.contentEditable = false;
        }
    });
});