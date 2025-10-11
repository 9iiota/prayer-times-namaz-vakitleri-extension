import * as utils from "./utils.js";
import { countryMap } from "./country-map.js";
import Fuse from "./libs/fuse.min.mjs";

class BackgroundController
{
    constructor(storage)
    {
        this.storage = storage;
        this.todayPrayerTimes = null;
        this.nextPrayerIndex = null;
        this.badgeText = "";
        this.badgeBackgroundColor = "";
        this.badgeTaskIntervalMs = 60 * 1000; // Default to 1 minute
        this.badgeTaskId = null;

        if (this.storage.prayerTimes)
        {
            this.startBadgeTask();
        }

        chrome.storage.onChanged.addListener(async (changes, area) =>
        {
            if (area === 'local')
            {
                switch (Object.keys(changes)[0])
                {
                    case "isPrayed":
                        this.onIsPrayedChanged(changes.isPrayed);
                        break;
                    case "isNotificationsOn":
                        this.onIsNotificationsOnChanged(changes.isNotificationsOn);
                        // TODO
                        break;
                    case "notificationsMinutesBefore":
                        // TODO
                        break;
                    case "parameters":
                        await this.onParametersChanged(changes.parameters);
                        console.log("fdsfds");
                        // Notify popup.js (if open)
                        const action = "prayerTimesProcessed";
                        chrome.runtime.sendMessage({ action: action, data: { prayerTimes: this.storage.prayerTimes } })
                            .catch((error) =>
                            {
                                utils.timeLog(`Popup page not open, cannot send ${action} message.`, error);
                            });
                        break;
                    case "prayerTimes":
                        await this.onPrayerTimesChanged(changes.prayerTimes);

                        // // Notify popup.js (if open)
                        // const action = "prayerTimesProcessed";
                        // chrome.runtime.sendMessage({ action: action, data: { prayerTimes: this.storage.prayerTimes } })
                        //     .catch((error) =>
                        //     {
                        //         utils.timeLog(`Popup page not open, cannot send ${action} message.`, error);
                        //     });
                        break;
                    default:
                        break;
                }
            }
        });

        // chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) =>
        // {
        //     if (message.action === "fetchPrayerTimes")
        //     {
        //         const { countryId, city, state } = message.data;

        //         const cities = await this.fetchCitiesIslamVakti(countryId)
        //         const cityId = this.fuzzySearch(city, cities)?.id;
        //         if (!cityId) throw new Error(`City not found: ${city} in country ID: ${countryId}`);

        //         const prayerTimes = await this.fetchPrayerTimesIslamVakti(countryId, cityId);
        //         console.log(prayerTimes);
        //         // this.storage.prayerTimes = prayerTimes;
        //     }
        // });
    }

    static instance = null;

    async fetchCitiesIslamVakti(countryId)
    {
        const res = await fetch("https://islamvakti.com/ajax/country", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
            body: `country_id=${encodeURIComponent(countryId)}`
        });
        if (!res.ok) throw new Error('Network response not ok');
        const text = await res.text();

        // Capture <option value='id'>City Name</option>
        const cityRegex = /<option value='(\d+)'>([^<]+)<\/option>/g;
        let cities = [];
        let cityMatch;
        while ((cityMatch = cityRegex.exec(text)) !== null)
        {
            cities.push({ id: cityMatch[1], name: cityMatch[2].trim() });
        }
        return cities;
    }

    fuzzySearch(query, list, keys = ["name"], threshold = 0.3)
    {
        if (!query || !list || list.length === 0) return null;

        const fuse = new Fuse(list, {
            keys: keys,
            threshold: threshold,
            includeScore: true,
        });

        const results = fuse.search(query, { limit: 1 });
        return results.length > 0 ? results[0].item : null;
    }

    async fetchPrayerTimesIslamVakti()
    {
        const countryId = Object.keys(countryMap).find(key => countryMap[key] === this.storage.parameters.country);
        if (!countryId) throw new Error(`Country not found: ${this.storage.parameters.country}`);

        const cities = await this.fetchCitiesIslamVakti(countryId)
        const cityId = this.fuzzySearch(this.storage.parameters.city, cities)?.id;
        if (!cityId) throw new Error(`City not found: ${this.storage.parameters.city} in country ID: ${countryId}`);

        const response = await fetch("https://islamvakti.com/home/vakitler", {
            headers: { "Referer": `https://islamvakti.com/home/index/${encodeURIComponent(countryId)}/${encodeURIComponent(cityId)}/yok` }
        });
        if (!response.ok) throw new Error(`Failed to fetch prayer times from IslamVakti. Status: ${response.status}`);
        const text = await response.text();

        // Capture everything from the first <tr> with a background-color style to the end of the string
        // The first <tr> with a background-color style indicates today's prayer times
        const futurePrayersTextRegex = /<tr[^>]*style=["'][^"']*background-color[^"']*["'][^>]*>[\s\S]*/i;
        const futurePrayersMatch = text.match(futurePrayersTextRegex);
        if (!futurePrayersMatch) throw new Error('Unexpected response format from prayer times site');

        // Capture <tr>...</tr>
        const prayerRowsRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
        const prayerRowsMatch = futurePrayersMatch[0].match(prayerRowsRegex);
        if (!prayerRowsMatch) throw new Error('No prayer rows found in response');

        let previousDate = null;
        const prayerTimes = prayerRowsMatch.map(row =>
        {
            // Capture each <td>...</td>
            const columnsRegex = /<td[^>]*>(?:<b>)*([\s\S]*?)(?:<\/b>)*<\/td>/g;
            const columnsMatch = row.match(columnsRegex);
            if (!columnsMatch) return null;

            // Capture date in format DD.MM.YYYY
            const dateRegex = /(\d{2})\.(\d{2})\.(\d{4})/;
            const dateMatch = dateRegex.exec(columnsMatch[0]);
            if (!dateMatch) return null;
            const [_, day, month, year] = dateMatch;
            const date = `${year}-${month}-${day}`;
            if (previousDate && date <= previousDate) return null; // Ensure dates are in ascending order
            previousDate = date;

            // Capture times in format HH:MM
            const timeRegex = /<td[^>]*>(?:<b>)*(\d{2}:\d{2})(?:<\/b>)*<\/td>/g;
            const timeMatches = [...row.matchAll(timeRegex)];
            if (timeMatches.length < 6) return null; // Ensure there are at least 6 time entries

            // Extract times and trim whitespace
            const times = timeMatches.map(match => match[1].trim());
            return { date, times };
        }).filter(entry => entry !== null && entry.date >= new Date().toISOString().split('T')[0]); // Filter out nulls and past dates

        return prayerTimes;
    }

    async fetchPrayerTimesIslamicFinder()
    {
        const response = await fetch(`https://www.islamicfinder.us/index.php/api/prayer_times?show_entire_month&country=${encodeURIComponent(this.storage.parameters.countryCode)}&zipcode=${encodeURIComponent(this.storage.parameters.zipCode)}&latitude=${encodeURIComponent(this.storage.parameters.latitude)}&longitude=${encodeURIComponent(this.storage.parameters.longitude)}&method=${encodeURIComponent(this.storage.parameters.calculationMethodId)}&juristic=${encodeURIComponent(this.storage.parameters.asrMethodId)}&time_format=0`);
        if (!response.ok) throw new Error(`Failed to fetch prayer times from IslamicFinder API. Status: ${response.status}`);
        const json = await response.json();

        const todayStr = new Date().toISOString().split("T")[0];
        const prayerTimes = Object.entries(json.results).map(([date, times]) => ({
            date: date.replace(/-(\d)$/, "-0$1"), // Pad single digit days with leading zero
            times: [times.Fajr, times.Duha, times.Dhuhr, times.Asr, times.Maghrib, times.Isha]
        })).filter(entry => entry.date >= todayStr);
        if (prayerTimes.length === 0) throw new Error("No prayer times found from IslamicFinder API");

        return prayerTimes;
    }

    async fetchPrayerTimes()
    {
        let prayerTimes = [];

        // Try fetching from IslamVakti first
        if (this.storage.parameters.calculationMethodId === "13" && this.storage.parameters.asrMethodId === "0" && this.storage.parameters.country && this.storage.parameters.city)
        {
            try
            {
                utils.timeLog("Fetching prayer times from IslamVakti...");
                prayerTimes = await this.fetchPrayerTimesIslamVakti();
                if (!prayerTimes || prayerTimes.length === 0) throw new Error("No prayer times found from IslamVakti");

                utils.timeLog(`Fetched ${prayerTimes.length} prayer times from IslamVakti`);
            }
            catch (error)
            {
                console.error("Error fetching prayer times from IslamVakti:", error);
            }
        }

        if (!prayerTimes || prayerTimes.length === 0)
        {
            // Fallback to API if IslamVakti fails
            try
            {
                utils.timeLog("Falling back to IslamicFinder API...");
                prayerTimes = await this.fetchPrayerTimesIslamicFinder();
                if (!prayerTimes || prayerTimes.length === 0) throw new Error("No prayer times found from IslamicFinder API");

                utils.timeLog(`Fetched ${prayerTimes.length} prayer times from IslamicFinder API`);
            }
            catch (error)
            {
                console.error("Error fetching prayer times from IslamicFinder API:", error);
            }
        }

        return prayerTimes;
    }

    async retrieveCityId(countryId, city, state)
    {
        // Fetch the country/state list
        const res = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/home/GetRegList?ChangeType=country&CountryId=${encodeURIComponent(countryId)}&Culture=en-US`);
        if (!res.ok) throw new Error('Network response not ok');
        console.log(res);
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

            const bestStateMatchObj = this.fuzzySearch(state || city, states); // { name: "", id: "" }
            if (!bestStateMatchObj) return null;

            const stateRes = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/home/GetRegList?ChangeType=state&CountryId=${encodeURIComponent(countryId)}&StateId=${encodeURIComponent(bestStateMatchObj.id)}&Culture=en-US`);
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
        const bestCityMatch = this.fuzzySearch(city, cities);
        return bestCityMatch?.id || null;
    }

    static async init()
    {
        if (BackgroundController.instance)
        {
            utils.timeLog('BackgroundController instance already exists.');
            return BackgroundController.instance;
        }

        try
        {
            // chrome.local.storage.clear(); // TODO test when less than 1 hour
            const keys = Object.keys(utils.STORAGE_DEFAULTS);
            const existing = await chrome.storage.local.get(keys);

            // If existing already has a value for that key, use it
            // Otherwise, fall back to the default value in this.defaultStorageValues
            const merged = Object.fromEntries(
                keys.map(key => [key, existing[key] ?? utils.STORAGE_DEFAULTS[key]])
            );

            await chrome.storage.local.set(merged);
            utils.timeLog('Initialized storage with default values:', merged);

            BackgroundController.instance = new BackgroundController(merged);
            return BackgroundController.instance;
        }
        catch (error)
        {
            console.error('Error initializing storage:', error);
        }
    }

    sendNotification(message)
    {
        const notificationOptions = {
            iconUrl: "icons/icon128.png",
            priority: 2,
            message: message,
            title: "Prayer Times",
            type: "basic",
        };
        chrome.notifications.create("", notificationOptions);
    }

    async updateBadge()
    {
        if (!this.storage.prayerTimes || this.storage.prayerTimes.length === 0)
        {
            utils.timeLog("No prayer times found in storage");
            return;
        }

        if (!this.todayPrayerTimes)
        {
            this.todayPrayerTimes = await this.getDatePrayerTimes();
            if (!this.todayPrayerTimes)
            {
                utils.timeLog("No prayer times found for today");
                return;
            }
        }

        const nextPrayerIndex = utils.getCurrentPrayerIndex(this.todayPrayerTimes) + 1;
        let nextPrayerTime;
        if (nextPrayerIndex < this.todayPrayerTimes.times.length)
        {
            nextPrayerTime = this.todayPrayerTimes.times[nextPrayerIndex];
        }
        else
        {
            // If there is no next prayer time today, get the first prayer time of tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowPrayerTimes = await this.getDatePrayerTimes(tomorrow);
            if (!tomorrowPrayerTimes) throw new Error("No prayer times found for tomorrow");
            nextPrayerTime = tomorrowPrayerTimes.times[0];
        }

        if (this.nextPrayerIndex === null)
        {
            this.nextPrayerIndex = nextPrayerIndex;
        }
        else if (this.nextPrayerIndex !== nextPrayerIndex)
        {
            // If notifications are on and the notificationsMinutesBefore is 0, send a notification for the previous nextPrayerIndex before it changes
            if (this.storage.isNotificationsOn && this.storage.notificationsMinutesBefore === "0")
            {
                this.sendNotification(`It's time for ${utils.PRAYER_NAMES[this.nextPrayerIndex]} prayer now!`);
            }

            utils.timeLog(`Prayer changed from index ${this.nextPrayerIndex} to ${nextPrayerIndex}`);
            this.nextPrayerIndex = nextPrayerIndex;

            this.storage.isPrayed = false;
            this.todayPrayerTimes = await this.getDatePrayerTimes(); // Refresh today's prayer times in case date changed


            await chrome.storage.local.set({ isPrayed: this.storage.isPrayed });
            chrome.runtime.sendMessage({ action: "prayerChanged", data: { todayPrayerTimes: this.todayPrayerTimes, isPrayed: this.storage.isPrayed } })
                .catch((error) =>
                {
                    utils.timeLog(`Popup page not open, cannot send prayerChanged message.`, error);
                });
        }

        const currentTimeFormatted = utils.getCurrentTimeFormatted(); // Extra minutes can be added for testing purposes
        const timeDifference = this.getTimeDifference(currentTimeFormatted, nextPrayerTime);
        if (this.badgeText !== timeDifference)
        {
            this.badgeText = timeDifference;
            chrome.action.setBadgeText({ text: this.badgeText });
            utils.timeLog('Updated badge text to', this.badgeText);
        }

        this.updateBadgeColors();

        if (this.storage.isNotificationsOn && timeDifference === `${this.storage.notificationsMinutesBefore}m`)
        {
            this.sendNotification(`It's time for ${utils.PRAYER_NAMES[nextPrayerIndex]} prayer in ${this.storage.notificationsMinutesBefore} minutes!`);
        }

        if (timeDifference.includes("s"))
        {
            this.badgeTaskIntervalMs = 1000; // Set to 1 second
        }
        else
        {
            this.badgeTaskIntervalMs = this.msUntilNextMinute() + 1000; // Add a second to ensure we are in the next minute
        }
    }

    msUntilNextMinute()
    {
        const now = new Date();
        const seconds = now.getSeconds();
        const milliseconds = now.getMilliseconds();

        return (60 - seconds) * 1000 - milliseconds;
    }

    getTimeDifference(startTime, endTime)
    {
        // Convert HH:MM to total minutes
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);

        const totalStartMinutes = startH * 60 + startM;
        const totalEndMinutes = endH * 60 + endM;

        let timeDifferenceMinutes = totalEndMinutes - totalStartMinutes;

        if (timeDifferenceMinutes === 1)
        {
            const secondsUntilNextMinute = this.msUntilNextMinute() / 1000;
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

    async startBadgeTask()
    {
        if (this.badgeTaskId) clearTimeout(this.badgeTaskId);
        await this.updateBadge();
        this.badgeTaskId = setTimeout(() => this.startBadgeTask(), this.badgeTaskIntervalMs);
    }

    async updateBadgeColors()
    {
        let backgroundColor = utils.COLORS.LIGHT_BLUE;
        if (this.storage.isPrayed)
        {
            backgroundColor = utils.COLORS.GREEN;
        }
        else
        {
            const currentPrayerIndex = utils.getCurrentPrayerIndex(this.todayPrayerTimes);
            if (currentPrayerIndex !== 1)
            {
                const badgeText = await chrome.action.getBadgeText({});
                if (badgeText.includes("m"))
                {
                    backgroundColor = utils.COLORS.RED;
                }
            }
        }

        if (this.badgeBackgroundColor !== backgroundColor)
        {
            this.badgeBackgroundColor = backgroundColor;
            chrome.action.setBadgeBackgroundColor({ color: this.badgeBackgroundColor });
            utils.timeLog('Set badge background color to', this.badgeBackgroundColor);

            // chrome.runtime.sendMessage({ action: "prayerChanged", data: this.todayPrayerTimes })
            //     .catch((error) => { }); // Ignore errors if no popup is open TODO Fix
            // TODO
        }
    }

    async onIsPrayedChanged(change)
    {
        this.storage.isPrayed = change.newValue;
        this.updateBadgeColors();
        utils.timeLog('isPrayed changed from', change.oldValue, 'to', change.newValue);
    }

    async onIsNotificationsOnChanged(change)
    {
        this.storage.isNotificationsOn = change.newValue;
        utils.timeLog('isNotificationsOn changed from', change.oldValue, 'to', change.newValue);
    }

    async onParametersChanged(change)
    {
        this.storage.parameters = change.newValue;
        utils.timeLog('parameters changed from', change.oldValue, 'to', change.newValue);

        // TODO clean up
        const prayerTimes = await this.fetchPrayerTimes();
        if (prayerTimes)
        {
            await chrome.storage.local.set({ prayerTimes: prayerTimes });
            this.storage.prayerTimes = prayerTimes;
            this.todayPrayerTimes = null;
            this.nextPrayerIndex = null;
            await this.startBadgeTask();
        }
    }

    async onPrayerTimesChanged(change)
    {
        this.storage.prayerTimes = change.newValue;
        utils.timeLog(`prayerTimes changed from ${change.oldValue?.length || 0} entries to ${change.newValue?.length || 0} entries`);
        this.todayPrayerTimes = null;
        this.nextPrayerIndex = null;
        this.startBadgeTask();
    }

    async getDatePrayerTimes(date = new Date())
    {
        try
        {
            const storage = await chrome.storage.local.get(['prayerTimes']);
            if (storage.prayerTimes)
            {
                const dateStr = date.toISOString().split('T')[0];
                return storage.prayerTimes.filter(pt => pt.date === dateStr)[0] || null;
            }
        }
        catch (error)
        {
            console.error('Error getting prayer times for date:', error);
            return null;
        }
    }

    getTimeFromNowBadgeFormatted(endTimeFormatted)
    {
        const startTimeFormatted = utils.getCurrentTimeFormatted(); // Extra minutes can be added for testing purposes
        const [hours1, minutes1] = startTimeFormatted.split(':').map(Number);
        const [hours2, minutes2] = endTimeFormatted.split(':').map(Number);

        const startDate = new Date();
        startDate.setHours(hours1, minutes1, 0, 0);

        const endDate = new Date();
        endDate.setHours(hours2, minutes2, 0, 0);

        let diffMs = endDate - startDate;
        if (diffMs < 0)
        {
            // TODO idk if this works correctly
            // Add 24 hours if end time is on the next day
            diffMs += 24 * 60 * 60 * 1000;
        }

        // If time difference is 1 minute or less, return the amount of seconds
        if (diffMs <= 60 * 1000)
        {
            const diffSeconds = Math.floor(diffMs / 1000);
            return `${diffSeconds}s`;
        }

        // If time difference is less than 1 hour, return the amount of minutes
        if (diffMs < 60 * 60 * 1000)
        {
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            return `${diffMinutes}m`;
        }

        // Else return the amount of hours and minutes padded with a leading zero if needed
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${diffHours}:${diffMinutes.toString().padStart(2, '0')}`;
    }
}

// Used to keep the service worker alive
chrome.alarms.create({ periodInMinutes: .4 })
chrome.alarms.onAlarm.addListener(() =>
{
    console.log('Keeping service worker alive...')
});

chrome.runtime.onInstalled.addListener(async () =>
{
    await BackgroundController.init();
});
chrome.runtime.onStartup.addListener(async () =>
{
    await BackgroundController.init();
});
chrome.idle.onStateChanged.addListener(async (newState) =>
{
    console.log(`Idle state changed to ${newState}`);
    if (newState === "active")
    {
        await BackgroundController.init();
    }
});