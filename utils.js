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
    const container = document.querySelector(".grid-container");
    const today = new Date().toISOString().split("T")[0];
    const todayTimes = prayerTimes.find(times => times.date === today);
    if (!todayTimes) return;

    // Find current prayer index
    const now = getCurrentTime();
    const passedTimes = todayTimes.times.filter(time => time <= now);
    const currentPrayerIndex = todayTimes.times.indexOf(passedTimes.at(-1));

    // Clear old "current-prayer" marker
    document.querySelectorAll("#current-prayer").forEach(el => el.removeAttribute("id"));

    PRAYER_NAMES.forEach((name, i) =>
    {
        console.log(name, i);
        let div = container.querySelectorAll(".prayer")[i];

        // Create element if missing
        if (!div)
        {
            div = document.createElement("div");
            div.className = "prayer";

            const nameSpan = document.createElement("span");
            nameSpan.className = "prayer-name";
            nameSpan.textContent = name;

            const timeSpan = document.createElement("span");
            timeSpan.className = "prayer-time";

            div.appendChild(nameSpan);
            div.appendChild(timeSpan);

            // Add toggle listener once
            div.addEventListener("click", () =>
            {
                div.classList.toggle("prayed");
            });

            container.appendChild(div);
        }

        // Update time
        const timeSpan = div.querySelector(".prayer-time");
        timeSpan.textContent = todayTimes.times[i];

        // Highlight current prayer
        if (i === currentPrayerIndex)
        {
            div.id = "current-prayer";
        }
    });
}

export function getCurrentTime()
{
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}: ${minutes}`;
}

export function saveToStorage(keyOrObject, value)
{
    return new Promise((resolve, reject) =>
    {
        let data;

        if (typeof keyOrObject === "object" && keyOrObject !== null)
        {
            // Case: multiple key-value pairs
            data = keyOrObject;
        }
        else
        {
            // Case: single key-value pair
            data = { [keyOrObject]: value };
        }

        chrome.storage.sync.set(data, () =>
        {
            if (chrome.runtime.lastError)
            {
                console.error("❌ Failed to save:", chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            }
            else
            {
                const savedKeys = Object.keys(data);
                console.log(`✅ Saved successfully: ${savedKeys.join(", ")}`);
                resolve(data);
            }
        });
    });
}

export function getTimeDifference(startTime, endTime)
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