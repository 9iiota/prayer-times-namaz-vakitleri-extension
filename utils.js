import { countryMap } from "./countryMap.js";

const PRAYER_NAMES = ["Fajr", "Sun", "Dhuhr", "Asr", "Maghrib", "Isha"];

export async function fetchPrayerTimes(countryCode = null, zipCode = null, latitude = null, longitude = null, methodId = 13, asrMethodId = 0, country = null, state = null, city = null)
{
    // TODO use state if available
    let prayerTimes = null;
    if (methodId == 13)
    {
        try
        {
            const countryId = Object.keys(countryMap).find(key => countryMap[key] === country);
            if (!countryId) throw new Error('Country not found in countryMap');

            const cityId = await retrieveCityId(countryId, city);
            if (!cityId) throw new Error('No cities found for country');

            const res = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/${cityId}`);
            if (!res.ok) throw new Error('Network response not ok');
            const htmlText = await res.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, "text/html");

            prayerTimes = [];
            const days = doc.querySelectorAll("#tab-1 > div > table > tbody > tr");
            days.forEach(day =>
            {
                const children = day.children;
                const dateStr = children[0].textContent.trim();
                const [d, m, y] = dateStr.split(".");
                const date = new Date(y, m - 1, d, 12);

                const timeTds = Array.from(children).slice(2);
                const times = timeTds.map(cell => cell.textContent.trim());

                prayerTimes.push({
                    date: date.toISOString().split("T")[0],
                    times
                });
            });

            // if everything worked, return immediately
            if (prayerTimes.length > 0) return prayerTimes;
        }
        catch (err)
        {
            console.log('Method 13 failed, falling back to next method');
            // do not return; continue to fallback
        }
    }

    // fallback to the other API
    try
    {
        const res = await fetch(`https://www.islamicfinder.us/index.php/api/prayer_times?show_entire_month&country=${countryCode}&zipcode=${zipCode}&latitude=${latitude}&longitude=${longitude}&method=${methodId}&juristic=${asrMethodId}&time_format=0`);
        if (!res.ok) throw new Error('Network response not ok');
        const json = await res.json();

        const todayStr = new Date().toISOString().split("T")[0];

        prayerTimes = Object.entries(json.results).map(([date, times]) => ({
            date: date.replace(/-(\d)$/, "-0$1"),
            times: [times.Fajr, times.Duha, times.Dhuhr, times.Asr, times.Maghrib, times.Isha]
        })).filter(entry => entry.date >= todayStr);

        return prayerTimes.length > 0 ? prayerTimes : null;
    }
    catch (err)
    {
        console.error('Fallback API failed', err);
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
        // console.log(name, i);
        let div = container.querySelectorAll(".prayer")[i];

        // Create element if missing
        if (!div)
        {
            div = document.createElement("div");
            div.className = "prayer";
            div.addEventListener("click", () =>
            {
                div.classList.toggle("prayed");
            });

            // const leftDiv = document.createElement("div");
            // const leftSpan = document.createElement("span");
            // leftSpan.textContent = "-";
            // leftSpan.className = "time-adjust";

            const prayerContainer = document.createElement("div");
            prayerContainer.className = "prayer-container";

            // const rightDiv = document.createElement("div");
            // const rightSpan = document.createElement("span");
            // rightSpan.textContent = "+";
            // rightSpan.className = "time-adjust";

            const nameSpan = document.createElement("span");
            nameSpan.className = "prayer-name";
            nameSpan.textContent = name;

            const timeSpan = document.createElement("span");
            timeSpan.className = "prayer-time";

            // leftDiv.appendChild(leftSpan);
            prayerContainer.appendChild(nameSpan);
            prayerContainer.appendChild(timeSpan);
            // rightDiv.appendChild(rightSpan);
            // div.appendChild(leftDiv);
            div.appendChild(prayerContainer);
            // div.appendChild(rightDiv);
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
    return `${hours}:${minutes}`;
}

export function getFromStorage(keys)
{
    return new Promise((resolve, reject) =>
    {
        chrome.storage.sync.get(keys, (storage) =>
        {
            if (chrome.runtime.lastError)
            {
                console.error("❌ Failed to get storage:", chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            }
            else
            {
                resolve(storage);
            }
        });
    });
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

export async function retrieveCityId(countryId, city)
{
    // Fetch the country/state list
    const res = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/home/GetRegList?ChangeType=country&CountryId=${countryId}&Culture=en-US`);
    if (!res.ok) throw new Error('Network response not ok');
    const json = await res.json();

    let citiesList = [];

    if (json.HasStateList)
    {
        // Fallback to StateList if StateRegionList is null
        const states = json.StateList.map(item =>
        {
            const values = Object.values(item);
            return { name: values[2]?.trim(), id: values[3] };
        }).filter(item => item.name && item.id);

        const bestStateMatch = fuzzySearch(city, states)?.[0];
        if (!bestStateMatch) return null;

        const stateRes = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/home/GetRegList?ChangeType=state&CountryId=${countryId}&StateId=${bestStateMatch.id}&Culture=en-US`);
        if (!stateRes.ok) throw new Error('Network response not ok');
        const stateJson = await stateRes.json();
        citiesList = stateJson.StateRegionList || [];
    }
    else
    {
        citiesList = json.StateRegionList;
    }

    // Map cities to simplified objects
    const cities = citiesList.map(item =>
    {
        const values = Object.values(item);
        return { name: values[values.length - 2]?.trim(), id: values[values.length - 1] };
    }).filter(item => item.name && item.id);

    // Fuzzy search for best city match
    const bestCityMatch = fuzzySearch(city, cities);
    return bestCityMatch?.id || null;
}

export function fuzzySearch(query, options, threshold = 0.3)
{
    if (!query || !options || options.length === 0) return null;

    const fuse = new Fuse(options, {
        keys: ["name"],
        threshold: threshold,
        includeScore: true,
    });

    const results = fuse.search(query, { limit: 1 });
    return results.length > 0 ? results[0].item : null;
}