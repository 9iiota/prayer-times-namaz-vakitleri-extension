// TODO: ALLES ZELFDE WIDTH BEHALVE CURRENT DIE IS THICKER

const PRAYER_NAMES = ["Fajr", "Sun", "Dhuhr", "Asr", "Maghrib", "Isha"];

document.addEventListener("DOMContentLoaded", () =>
{
    chrome.storage.sync.get(["prayerTimesLink", "prayerSchedule", "location", "prayerTimes", "method"], async (storage) =>
    {
        const ip = await getPublicIP();
        // console.log(ip);

        const coords = await getLocationData(ip);
        const location = `${coords.country}, ${coords.city}`;
        if (storage.location !== location)
        {
            chrome.storage.sync.set({ location }, () =>
            {
                if (chrome.runtime.lastError)
                {
                    console.error("❌ Failed to save:", chrome.runtime.lastError);
                } else
                {
                    console.log("✅ Saved location successfully!");
                }
            });
        }

        // console.log(coords);

        // const pt = await getPrayerTimes(ip, coords.latitude, coords.longitude);
        // console.log(pt);

        const ptt = storage.prayerTimes;
        console.log(ptt);
        const method = storage.method || "13";

        const select = document.querySelector("#method-select");
        select.value = method;

        // 2. Save value when user changes selection
        select.addEventListener("change", async () =>
        {
            chrome.storage.sync.set({ method: select.value }, () =>
            {
                if (chrome.runtime.lastError)
                {
                    console.error("❌ Failed to save:", chrome.runtime.lastError);
                } else
                {
                    console.log("✅ Saved method successfully!");
                }
            });

            await getPrayerTimes(ip, coords.latitude, coords.longitude, select.value);
        });

        const prayerTimesLink = storage.prayerTimesLink || "https://namazvakitleri.diyanet.gov.tr/en-US/9206";
        const prayerSchedule = storage.prayerSchedule;
        const prayerTimes = storage.prayerTimes;
        // console.log(prayerSchedule);

        const prayerTimesContainer = document.querySelector(".grid-container");

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const todayPrayertimes = prayerTimes.find(schedule => schedule.date === dateStr);

        const passedTimes = todayPrayertimes.times.filter(time => time <= getCurrentTime());
        const currentPrayerTime = passedTimes[passedTimes.length - 1];
        const currentPrayerIndex = todayPrayertimes.times.indexOf(currentPrayerTime);

        for (let i = 0; i < PRAYER_NAMES.length; i++)
        {
            const name = PRAYER_NAMES[i];
            const time = todayPrayertimes.times[i];

            const div = document.createElement("div");
            div.className = "prayer";

            const nameSpan = document.createElement("span");
            nameSpan.textContent = name;
            nameSpan.className = "prayer-name";

            const timeSpan = document.createElement("span");
            timeSpan.textContent = time;
            timeSpan.className = "prayer-time";

            div.appendChild(nameSpan);
            div.appendChild(timeSpan);

            if (i === currentPrayerIndex)
            {
                div.id = "current-prayer";
                div.addEventListener("click", () =>
                {
                    if (div.classList.contains("prayed"))
                        div.classList.remove("prayed");
                    else
                        div.classList.add("prayed");
                });
            }

            prayerTimesContainer.appendChild(div);
        }

        const citySpan = document.querySelector("#city");
        const locationResults = document.createElement("div");
        locationResults.style.position = "absolute";
        locationResults.style.background = "#fff";
        locationResults.style.border = "1px solid #ccc";
        locationResults.style.zIndex = "1000";
        locationResults.style.display = "none"; // hide initially
        document.body.appendChild(locationResults);

        // Example initial location
        citySpan.textContent = location;

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
                locationResults.style.display = "none";
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
                    } else
                    {
                        data.forEach(place =>
                        {
                            const option = document.createElement("div");
                            option.textContent = place.display_name;
                            option.style.padding = "4px";
                            option.style.cursor = "pointer";

                            option.addEventListener("click", () =>
                            {
                                // Save selected location
                                citySpan.textContent = place.display_name;
                                chrome.storage.local.set({
                                    manualLocation: {
                                        city: place.address.city || place.address.town || place.address.village,
                                        country: place.address.country,
                                        lat: place.lat,
                                        lng: place.lon,
                                        display_name: place.display_name
                                    }
                                });
                                locationResults.style.display = "none";
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

                } catch (err)
                {
                    console.error(err);
                }
            }
        });
    });
});

function getCurrentTime()
{
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

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

    return `${pad(diffH)}:${pad(diffM)}`;
}

async function getPublicIP()
{
    try
    {
        const res = await fetch('https://api.ipify.org?format=json');
        if (!res.ok) throw new Error('Network response not ok');
        const json = await res.json();
        return json.ip;
    }
    catch (err)
    {
        console.error('IP fetch error', err);
        return null;
    }
}

async function getLocationData(ip)
{
    try
    {
        const res = await fetch(`https://ipwhois.app/json/${ip}`);
        if (!res.ok) throw new Error('Network response not ok');
        const json = await res.json();
        return { latitude: json.latitude, longitude: json.longitude, country: json.country, city: json.city };
    }
    catch (err)
    {
        console.error('IP fetch error', err);
        return null;
    }
}

// async function getCityFromIP(ip)
// {
//     try
//     {
//         const res = await fetch(`https://ipwhois.app/json/${ip}`);
//         if (!res.ok) throw new Error('Network response not ok');
//         const json = await res.json();
//         return json.city;
//     }
//     catch (err)
//     {
//         console.error('City fetch error', err);
//         return null;
//     }
// }

async function getPrayerTimes(ip, latitude, longitude, methodId = 13)
{
    try
    {
        const res = await fetch(`https://www.islamicfinder.us/index.php/api/prayer_times?show_entire_month&user_ip=${ip}&latitude=${latitude}&longitude=${longitude}&method=${methodId}&time_format=0`);
        if (!res.ok) throw new Error('Network response not ok');
        const json = await res.json();

        const today = new Date();
        const todayStr = today.toISOString().split("T")[0]; // e.g. "2025-09-16"

        const prayerTimes = Object.entries(json.results).map(([date, times]) => ({
            date: date.replace(/-(\d)$/, "-0$1"), // ensure day has leading 0 (e.g. 2025-09-1 → 2025-09-01)
            times: [
                times.Fajr,
                times.Duha,
                times.Dhuhr,
                times.Asr,
                times.Maghrib,
                times.Isha
            ]
        })).filter(entry => entry.date >= todayStr); // keep only today and future;

        chrome.storage.sync.set({ prayerTimes }, () =>
        {
            if (chrome.runtime.lastError)
            {
                console.error("❌ Failed to save:", chrome.runtime.lastError);
            } else
            {
                console.log("✅ Saved prayer times successfully!");
            }
        });

        return json;
    }
    catch (err)
    {
        console.error('Prayer times fetch error', err);
        return null;
    }
}