const PRAYER_NAMES = ["Fajr", "Sun", "Dhuhr", "Asr", "Maghrib", "Isha"];

export async function getPublicIP()
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

export async function getLocationData(ip)
{
    try
    {
        const res = await fetch(`https://ipwhois.app/json/${ip}`);
        if (!res.ok) throw new Error('Network response not ok');
        const json = await res.json();
        const locationData = {
            latitude: json.latitude,
            longitude: json.longitude,
            country: json.country,
            city: json.city
        }
        return locationData;
    }
    catch (err)
    {
        console.error('IP fetch error', err);
        return null;
    }
}

export async function getPrayerTimes(countryCode, postCode, latitude, longitude, methodId = 13)
{
    try
    {
        const res = await fetch(`https://www.islamicfinder.us/index.php/api/prayer_times?show_entire_month&country=${countryCode}&zipcode=${postCode}&latitude=${latitude}&longitude=${longitude}&method=${methodId}&time_format=0`);
        if (!res.ok) throw new Error('Network response not ok');
        const json = await res.json();
        console.log(json);

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

        return prayerTimes;
    }
    catch (err)
    {
        console.error('Prayer times fetch error', err);
        return null;
    }
}

export function displayTimes(prayerTimes)
{
    document.querySelectorAll(".prayer").forEach(el => el.remove());

    const container = document.querySelector(".grid-container");

    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    const todayTimes = prayerTimes.find(times => times.date === dateStr);

    const passedTimes = todayTimes.times.filter(time => time <= getCurrentTime());
    const currentPrayerTime = passedTimes[passedTimes.length - 1];
    const currentPrayerIndex = todayTimes.times.indexOf(currentPrayerTime);

    for (let i = 0; i < PRAYER_NAMES.length; i++)
    {
        const name = PRAYER_NAMES[i];
        const time = todayTimes.times[i];

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

        container.appendChild(div);
    }
}

export function getCurrentTime()
{
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}: ${minutes}`;
}