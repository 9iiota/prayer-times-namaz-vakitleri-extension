import { countryMap } from "./countryMap.js";

let lastRequestTime = 0;
let requestQueue = Promise.resolve();
let NEXT_PRAYER_INDEX, PRAYER_TIMES, IS_PRAYED, badgeText, badgeTextColor, badgeBackgroundColor, taskId, taskIntervallMs;

export const DEFAULT_STORAGE_VALUES =
{
    parameters:
    {
        countryCode: null,
        zipCode: null,
        latitude: null,
        longitude: null,
        calculationMethodId: 13,
        asrMethodId: 0,
        country: null,
        state: null,
        city: null
    },
    isPrayed: false,
};
export const PRAYER_NAMES = ["Fajr", "Sun", "Dhuhr", "Asr", "Maghrib", "Isha"];
export const PRAYER_CALCULATION_METHOD_IDS = {
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
    13: "Diyanet İşleri Başkanlığı",
    14: "Germany Custom",
    15: "Russia Custom",
};
export const ASR_JURISDICTION_METHOD_IDS = {
    0: "Shafi, Hanbali, Maliki",
    1: "Hanafi",
};
export const BLACK = "#000000";
export const WHITE = "#ffffff";
export const RED = "#eb6123";
export const BLUE = "#0072bb";
export const GREEN = "#7dc242";
export const LIGHT_RED = "#ffbaba";
export const LIGHT_BLUE = "#baebff";
export const LIGHT_GREEN = "#baffde";

export async function timeLog(message)
{
    const now = new Date();
    const formatted = now.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false, // force 24-hour
    });

    console.log(`[${formatted}] ${message}`);
}

export async function startPrayerTimeBadgeTask() 
{
    if (taskId) clearTimeout(taskId);
    await updatePrayerTimeBadge();
}

// TODO change function name
export async function updatePrayerTimeBadge()
{
    if (!PRAYER_TIMES || !IS_PRAYED)
    {
        const storage = await getFromStorage(["prayerTimes", "isPrayed"]);
        const { prayerTimes, isPrayed } = storage;
        if (!prayerTimes || prayerTimes.length === 0) return;
        if (isPrayed === undefined) return;
        PRAYER_TIMES = prayerTimes;
        IS_PRAYED = isPrayed;
    }

    // TODO needs to be done only once a day
    const now = new Date();
    const todayTimes = getPrayerTimesByDate(PRAYER_TIMES, now);
    if (!todayTimes) throw new Error("No prayer times found for today");

    let nextPrayerIndex = getCurrentPrayerIndex(todayTimes) + 1;
    let nextPrayerTime;
    if (nextPrayerIndex < todayTimes.times.length)
    {
        nextPrayerTime = todayTimes.times[nextPrayerIndex];
    }
    else
    {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowTimes = getPrayerTimesByDate(PRAYER_TIMES, tomorrow);
        if (!tomorrowTimes) throw new Error("No prayer times found for tomorrow");
        nextPrayerIndex = 0;
        nextPrayerTime = tomorrowTimes.times[nextPrayerIndex];
    }

    if (NEXT_PRAYER_INDEX === undefined)
    {
        NEXT_PRAYER_INDEX = nextPrayerIndex;
    }
    else if (NEXT_PRAYER_INDEX !== nextPrayerIndex)
    {
        NEXT_PRAYER_INDEX = nextPrayerIndex;
        displayTimes(todayTimes);
    }

    const timeDifference = getTimeDifference(getCurrentTimeFormatted(), nextPrayerTime);
    if (badgeText !== timeDifference)
    {
        badgeText = timeDifference;
        setBadgeText(timeDifference);
    }

    let backgroundColor;
    if (timeDifference.includes("m"))
    {
        // Less than an hour remaining
        backgroundColor = IS_PRAYED ? GREEN : RED;
    }
    else
    {
        // More than an hour remaining
        backgroundColor = IS_PRAYED ? GREEN : BLUE;
    }

    if (badgeBackgroundColor !== backgroundColor)
    {
        setBadgeBackgroundColor(backgroundColor);
        badgeBackgroundColor = backgroundColor;
    }

    const textColor = backgroundColor === BLUE ? WHITE : BLACK;
    if (badgeTextColor !== textColor)
    {
        setBadgeTextColor(textColor);
        badgeTextColor = textColor;
    }

    if (timeDifference.includes("s"))
    {
        taskIntervallMs = 1000; // Set to 1 second
    }
    else
    {
        taskIntervallMs = msUntilNextMinute() + 1000; // Add a second to ensure we are in the next minute
    }
    taskId = setTimeout(updatePrayerTimeBadge, taskIntervallMs);
}

export function setupLocationInput(gridContainer, parameters)
{
    const locationResults = document.createElement("div");
    locationResults.className = "location-results";
    gridContainer.appendChild(locationResults);

    const dropdowns = document.querySelectorAll(".method-container");
    const lastDropdown = dropdowns[dropdowns.length - 1];

    const locationContainer = document.createElement("div");
    locationContainer.className = "location-container";
    lastDropdown.after(locationContainer);

    const locationName = document.createElement("span");
    locationName.className = "location-name";
    locationContainer.appendChild(locationName);

    // Initial text
    locationName.textContent = parameters.city && parameters.country
        ? parameters.state
            ? `${parameters.city}, ${parameters.state}, ${parameters.country}`
            : `${parameters.city}, ${parameters.country}`
        : "Click to set location";

    // Make editable on click
    locationName.addEventListener("click", () =>
    {
        locationName.contentEditable = true;
        locationName.focus();
        document.execCommand("selectAll", false, null);
    });

    // Handle search on Enter
    locationName.addEventListener("keydown", async (e) =>
    {
        if (e.key !== "Enter") return;
        e.preventDefault();

        const query = locationName.textContent.trim();
        if (!query) return;

        try
        {
            const searchResults = await fetchNominatimSearch(query);

            renderLocationResults(searchResults, locationName, locationResults, parameters);
        } catch (err)
        {
            console.error("Location search error:", err);
        }
    });
}

export async function fetchNominatimSearch(query)
{
    return scheduleNominatimRequest(async () =>
    {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`,
            { headers: { "User-Agent": "https://github.com/9iiota/prayer-times-namaz-vakitleri-extension" } }
        );
        if (!res.ok) throw new Error("Failed to fetch search results");
        return res.json();
    });
}

export async function fetchZipAndUpdate(place, parameters)
{
    return scheduleNominatimRequest(async () =>
    {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(place.lat)}&lon=${encodeURIComponent(place.lon)}&addressdetails=1`,
            { headers: { "User-Agent": "https://github.com/9iiota/prayer-times-namaz-vakitleri-extension" } }
        );
        const data = await res.json();

        const zipCode = data.address.postcode?.split(" ")[0] ?? "";

        return {
            ...parameters,
            countryCode: data.address.country_code,
            zipCode: zipCode,
            latitude: place.lat,
            longitude: place.lon,
            country: place.address.country,
            state: place.address.state || place.address.province || "",
            city: place.address.city || place.address.town || place.address.village || ""
        };
    });
}

export function renderLocationResults(data, locationSpan, locationResults, parameters)
{
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

            option.addEventListener("click", async () =>
            {
                locationResults.style.display = "none";

                const location = [place.address.city || place.address.town || place.address.village,
                place.address.state || place.address.province,
                place.address.country]
                    .filter(Boolean)
                    .join(", ");
                locationSpan.textContent = location;

                parameters = await fetchZipAndUpdate(place, parameters);

                saveToStorage("parameters", parameters);

                const prayerTimes = await fetchPrayerTimes(
                    parameters.countryCode,
                    parameters.zipCode,
                    parameters.latitude,
                    parameters.longitude,
                    parameters.calculationMethodId,
                    parameters.asrMethodId,
                    parameters.country,
                    parameters.state,
                    parameters.city
                );

                saveToStorage("prayerTimes", prayerTimes);
                const dailyPrayerTimes = getPrayerTimesByDate(prayerTimes, new Date());
                await updatePrayerTimeBadge();
                displayTimes(dailyPrayerTimes);
            });

            locationResults.appendChild(option);
        });
    }

    // Position results below
    const rect = locationSpan.getBoundingClientRect();
    if (!document.querySelector(".prayer"))
    {
        locationResults.style.position = "relative";
        locationResults.style.top = "auto";
    } else
    {
        locationResults.style.position = "absolute";
        locationResults.style.top = `${rect.bottom + window.scrollY}px`;
    }
    locationResults.style.display = "block";
}

export function scheduleNominatimRequest(fn)
{
    requestQueue = requestQueue.then(async () =>
    {
        const now = Date.now();
        const wait = Math.max(0, 2000 - (now - lastRequestTime)); // enforce 2s

        if (wait > 0)
        {
            timeLog(`Scheduling Nominatim request. Will wait ${wait} ms before sending.`);
            await new Promise(res => setTimeout(res, wait));
        }
        lastRequestTime = Date.now();

        timeLog(`Nominatim request sent.`);

        return fn();
    });
    return requestQueue;
}

export async function setBadgeText(text)
{
    const currentText = await chrome.action.getBadgeText({});
    if (text !== currentText)
    {
        chrome.action.setBadgeText({ text: text });
        timeLog(`Badge text set to: ${text}`);
    }
}

export async function setBadgeTextColor(color)
{
    chrome.action.setBadgeTextColor({ color: color });
    timeLog(`Badge text color set to: ${color}`);
}

export async function setBadgeBackgroundColor(color)
{
    chrome.action.setBadgeBackgroundColor({ color: color });
    timeLog(`Badge background color set to: ${color}`);
}

export function rgbaArrayToHex(colorArray)
{
    // Ensure at least RGB values are provided
    if (colorArray.length < 3)
    {
        return false;
    }

    // Extract RGB values, ignore alpha for hex conversion
    const [r, g, b] = colorArray;

    // Convert each component to a two-digit hex string and concatenate
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

export async function setupDropdown({
    labelText,
    optionsMap,
    parameterKey
})
{
    const storage = await getFromStorage(["parameters"]);
    const parameters = storage.parameters;

    const gridContainer = document.querySelector(".grid-container");

    const methodContainer = document.createElement("div");
    methodContainer.className = "method-container";
    gridContainer.prepend(methodContainer);

    const methodLabel = document.createElement("span");
    methodLabel.className = "method-label";
    if (labelText) methodLabel.textContent = labelText;
    methodContainer.appendChild(methodLabel);

    const methodSelect = document.createElement("div");
    methodSelect.className = "method-select";
    methodContainer.appendChild(methodSelect);

    const methodName = document.createElement("span");
    methodName.className = "method-name";
    methodSelect.appendChild(methodName);

    const optionsContainer = document.createElement("div");
    optionsContainer.className = "method-options";
    methodContainer.appendChild(optionsContainer);

    // set initial text
    methodName.textContent = optionsMap[parameters[parameterKey]];

    // toggle dropdown
    methodSelect.addEventListener("click", () =>
    {
        optionsContainer.style.display = optionsContainer.style.display === "block" ? "none" : "block";
    });

    // build options
    Object.entries(optionsMap).forEach(([id, name]) =>
    {
        // console.log(id, name);
        const option = document.createElement("div");
        option.textContent = name;

        option.addEventListener("click", async () =>
        {
            const storage = await getFromStorage(["parameters"]);
            const { parameters } = storage;

            parameters[parameterKey] = id;
            saveToStorage("parameters", parameters);
            methodName.textContent = optionsMap[id];
            optionsContainer.style.display = "none";

            const prayerTimes = await fetchPrayerTimes(
                parameters.countryCode,
                parameters.zipCode,
                parameters.latitude,
                parameters.longitude,
                parameters.calculationMethodId,
                parameters.asrMethodId,
                parameters.country,
                parameters.state,
                parameters.city
            );

            saveToStorage("prayerTimes", prayerTimes);
            const dailyPrayerTimes = getPrayerTimesByDate(prayerTimes, new Date());
            displayTimes(dailyPrayerTimes);
        });

        optionsContainer.appendChild(option);
    });
}

export async function fetchPrayerTimes(countryCode = null, zipCode = null, latitude = null, longitude = null, calculationMethodId = 13, asrMethodId = 0, country = null, state = null, city = null)
{
    // TODO use state if available
    let prayerTimes = null;
    console.log(calculationMethodId, asrMethodId, country, city);
    // Try to scrape from https://namazvakitleri.diyanet.gov.tr/ first because the API times are usually off by a few minutes compared to the official site
    if (calculationMethodId == 13 && asrMethodId == 0 && country && city)
    {
        try
        {
            console.log("Trying method 13 scraping");
            const countryId = Object.keys(countryMap).find(key => countryMap[key] === country);
            if (!countryId) throw new Error('Country not found in countryMap');

            const cityId = await retrieveCityId(countryId, city);
            if (!cityId) throw new Error('No cities found for country');

            const res = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/${encodeURIComponent(cityId)}`);
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
        console.log(countryCode, zipCode, latitude, longitude, calculationMethodId, asrMethodId);
        const res = await fetch(`https://www.islamicfinder.us/index.php/api/prayer_times?show_entire_month&country=${encodeURIComponent(countryCode)}&zipcode=${encodeURIComponent(zipCode)}&latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&method=${encodeURIComponent(calculationMethodId)}&juristic=${encodeURIComponent(asrMethodId)}&time_format=0`);
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

export function getPrayerTimesByDate(prayerTimes, date)
{
    const targetDate = new Date(date);
    const dateStr = targetDate.toISOString().split("T")[0];
    return prayerTimes.find(entry => entry.date === dateStr);
}

export function getCurrentPrayerIndex(dailyPrayerTimes)
{
    const currentTime = getCurrentTimeFormatted();
    const passedTimes = dailyPrayerTimes.times.filter(time => time <= currentTime);
    return dailyPrayerTimes.times.indexOf(passedTimes.at(-1));
}

export async function displayTimes(dailyPrayerTimes)
{
    const storage = await getFromStorage(["isPrayed"]);
    const { isPrayed } = storage;

    const gridContainer = document.querySelector(".grid-container");
    const currentPrayerIndex = getCurrentPrayerIndex(dailyPrayerTimes);

    // Clear old "current-prayer" marker
    document.querySelectorAll("#current-prayer").forEach(el => el.removeAttribute("id"));

    PRAYER_NAMES.forEach(async (name, i) =>
    {
        let div = gridContainer.querySelectorAll(".prayer")[i];

        // Create element if missing
        if (!div)
        {
            div = document.createElement("div");
            div.className = "prayer";
            gridContainer.appendChild(div);

            const prayerContainer = document.createElement("div");
            prayerContainer.className = "prayer-container";
            div.appendChild(prayerContainer);

            const nameSpan = document.createElement("span");
            nameSpan.className = "prayer-name";
            nameSpan.textContent = name;

            const timeSpan = document.createElement("span");
            timeSpan.className = "prayer-time";

            prayerContainer.appendChild(nameSpan);
            prayerContainer.appendChild(timeSpan);
        }

        // Update time
        const timeSpan = div.querySelector(".prayer-time");
        timeSpan.textContent = dailyPrayerTimes.times[i];

        // Highlight current prayer
        if (i === currentPrayerIndex)
        {
            div.id = "current-prayer";
            if (isPrayed) div.classList.add("prayed");
            else div.classList.remove("prayed");
            const badgeBackgroundColor = rgbaArrayToHex(await chrome.action.getBadgeBackgroundColor({})).toLowerCase();
            div.style.backgroundColor = badgeBackgroundColor === RED ? LIGHT_RED : badgeBackgroundColor === BLUE ? LIGHT_BLUE : LIGHT_GREEN;

            div.addEventListener("click", async () =>
            {
                if (!div.classList.contains("prayed"))
                {
                    div.classList.add("prayed");
                    await saveToStorage("isPrayed", true);
                    IS_PRAYED = true;
                    await updatePrayerTimeBadge();
                }
                else
                {
                    div.classList.remove("prayed");
                    await saveToStorage("isPrayed", false);
                    IS_PRAYED = false;
                    await updatePrayerTimeBadge();
                }

                const badgeBackgroundColor = rgbaArrayToHex(await chrome.action.getBadgeBackgroundColor({})).toLowerCase();
                div.style.backgroundColor = badgeBackgroundColor === RED ? LIGHT_RED : badgeBackgroundColor === BLUE ? LIGHT_BLUE : LIGHT_GREEN;
            });
        }
    });
}

export function getCurrentTimeFormatted(extraMinutes = 0)
{
    const now = new Date();
    // Add extraMinutes properly
    now.setMinutes(now.getMinutes() + extraMinutes);

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
                console.log(`Successfully saved "${savedKeys.join(", ")}" to chrome storage`);
                resolve(data);
            }
        });
    });
}

export function msUntilNextMinute()
{
    const now = new Date();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();

    return (60 - seconds) * 1000 - milliseconds;
}

export function getTimeDifference(startTime, endTime)
{
    // Convert HH:MM to total minutes
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const totalStartMinutes = startH * 60 + startM;
    const totalEndMinutes = endH * 60 + endM;

    let timeDifferenceMinutes = totalEndMinutes - totalStartMinutes;

    if (timeDifferenceMinutes === 1)
    {
        const secondsUntilNextMinute = msUntilNextMinute() / 1000;
        return `${Math.ceil(secondsUntilNextMinute)}s`;
    }
    else if (timeDifferenceMinutes === 0)
    {
        return "0s";
    }

    // If the difference is negative, assume it's the next day
    if (timeDifferenceMinutes < 0) timeDifferenceMinutes += 24 * 60;

    const diffH = Math.floor(timeDifferenceMinutes / 60);
    const diffM = timeDifferenceMinutes % 60;

    // Pad with leading zero if needed
    const pad = n => n.toString().padStart(2, '0');

    return diffH === 0 ? `${diffM}m` : `${diffH}:${pad(diffM)}`;
}

export async function retrieveCityId(countryId, city)
{
    // Fetch the country/state list
    const res = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/home/GetRegList?ChangeType=country&CountryId=${encodeURIComponent(countryId)}&Culture=en-US`);
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

        const stateRes = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/home/GetRegList?ChangeType=state&CountryId=${encodeURIComponent(countryId)}&StateId=${encodeURIComponent(bestStateMatch.id)}&Culture=en-US`);
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

export async function populateStorage()
{
    // chrome.storage.sync.clear();
    try
    {
        const keys = Object.keys(DEFAULT_STORAGE_VALUES);
        const storage = await getFromStorage(keys);

        const toSet = {};
        for (const [key, defaultValue] of Object.entries(DEFAULT_STORAGE_VALUES))
        {
            if (storage[key] === undefined)
            {
                toSet[key] = defaultValue;
            }
        }

        if (Object.keys(toSet).length > 0)
        {
            await chrome.storage.sync.set(toSet);
            timeLog(`Populated default storage values`);
        }
        else
        {
            timeLog("Storage already initialized.");
        }
    }
    catch (err)
    {
        console.error("Failed to populate storage:", err);
    }
}