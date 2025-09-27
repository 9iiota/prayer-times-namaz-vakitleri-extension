import * as utils from "./utils.js";
import { countryMap } from "./country-map.js";

class BackgroundController
{
    constructor()
    {
        this.storage =
        {
            isPrayed: false,
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
            prayerTimes: null
        }
        this.initializeStorage();

        // TODO Start badge task if prayerTimes exist
        // this.startBadgeTask();

        // Listen for storage changes
        chrome.storage.onChanged.addListener(async (changes, area) =>
        {
            if (area === 'sync')
            {
                if (changes.isPrayed)
                {
                    // Update badge background color if isPrayed changed
                    this.storage.isPrayed = changes.isPrayed.newValue;
                    if (changes.isPrayed.newValue)
                    {
                        // Set badge background color to green if isPrayed is true
                        chrome.action.setBadgeBackgroundColor({ color: utils.COLORS.GREEN });
                    }
                    else
                    {
                        const todayPrayerTimes = await this.getDatePrayerTimes();
                        if (!todayPrayerTimes)
                        {
                            console.error('No prayer times found for today.');
                            return;
                        }

                        // If current prayer is Sun (index = 1), set badge background color to gray
                        const currentPrayerIndex = utils.getCurrentPrayerIndex(todayPrayerTimes);
                        if (currentPrayerIndex === 1)
                        {
                            chrome.action.setBadgeBackgroundColor({ color: utils.COLORS.GRAY });
                            return;
                        }
                        else
                        {
                            // Else if time until next prayer is >= 1 hour, set badge background color to blue
                            // Else set badge background color to red
                            let timeUntilNextPrayer;
                            if (currentPrayerIndex >= todayPrayerTimes.times.length - 1)
                            {
                                // If current prayer is the last one, get time until first prayer of next day
                                const tomorrow = new Date();
                                tomorrow.setDate(tomorrow.getDate() + 1);
                                const tomorrowPrayerTimes = await this.getDatePrayerTimes(tomorrow);
                                if (!tomorrowPrayerTimes)
                                {
                                    console.error('No prayer times found for tomorrow.');
                                    return;
                                }

                                timeUntilNextPrayer = this.getTimeFromNowBadgeFormatted(tomorrowPrayerTimes.times[0]);
                            }
                            else
                            {
                                timeUntilNextPrayer = this.getTimeFromNowBadgeFormatted(todayPrayerTimes.times[currentPrayerIndex + 1]);
                            }

                            if (timeUntilNextPrayer.includes('h'))
                            {
                                chrome.action.setBadgeBackgroundColor({ color: utils.COLORS.BLUE });
                            }
                            else
                            {
                                chrome.action.setBadgeBackgroundColor({ color: utils.COLORS.RED });
                            }
                        }
                    }
                }
                else if (changes.parameters)
                {
                    this.storage.parameters = changes.parameters.newValue;
                    this.fetchAndStorePrayerTimes(this.storage.parameters);
                }
                else if (changes.prayerTimes)
                {
                    // Update prayer times in popup if open
                    this.storage.prayerTimes = changes.prayerTimes.newValue;
                    chrome.runtime.sendMessage({ action: "updatePrayerTimes", data: this.storage.prayerTimes });
                }
            }
        });
    }

    async initializeStorage()
    {
        try
        {
            const keys = Object.keys(this.storage);
            const existing = await chrome.storage.local.get(keys);

            // If existing already has a value for that key, use it
            // Otherwise, fall back to the default value in this.defaultStorageValues
            const merged = Object.fromEntries(
                keys.map(key => [key, existing[key] ?? this.storage[key]])
            );

            this.storage = merged;
            await chrome.storage.local.set(merged);
            utils.timeLog('Initialized storage with default values:', merged);
        }
        catch (error)
        {
            console.error('Error initializing storage:', error);
        }
    }

    async getDatePrayerTimes(date = new Date())
    {
        try
        {
            const storage = await chrome.storage.local.get(['prayerTimes']);
            if (storage.prayerTimes)
            {
                const dateStr = date.toISOString().split('T')[0];
                return storage.prayerTimes[dateStr] || null;
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
        const startTimeFormatted = utils.getCurrentTimeFormatted();
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

    async fetchAndStorePrayerTimes(parameters)
    {
        // TODO
        let prayerTimes = [];
        // Try to scrape from https://namazvakitleri.diyanet.gov.tr/ first
        // because the API times are usually off by a few minutes compared to the official site
        if (parameters.calculationMethodId === 13
            && parameters.asrMethodId === 0
            && parameters.country
            && parameters.city
        )
            try
            {
                utils.timeLog('Fetching prayer times from official site...');
                const countryId = Object.keys(countryMap).find(key => countryMap[key] === parameters.country);
                if (!countryId) throw new Error(`Country not found in countryMap: ${parameters.country}`);

                // TODO use state if available

                const cityId = await utils.retrieveCityId(countryId, parameters.city);
                if (!cityId) throw new Error(`City not found: ${parameters.city} in country: ${parameters.country}`);

                const response = await fetch(`https://namazvakitleri.diyanet.gov.tr/en-US/${encodeURIComponent(cityId)}`);
                if (!response.ok) throw new Error(`Failed to fetch prayer times from official site. Status: ${response.status}`);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

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

                if (prayerTimes.length === 0) throw new Error('No prayer times found on the official site.');

                await chrome.storage.local.set({ prayerTimes });
                utils.timeLog('Fetched and stored prayer times from official site:', prayerTimes);
                return;
            }
            catch (error)
            {
                console.error('Error fetching prayer times from official site:', error);
            }

        // If scraping from official site failed, fall back to using the API
        try
        {
            // TODO continue from here
            const response = await fetch(
                `https://www.islamicfinder.us/index.php/api/prayer_times?
                show_entire_month&
                country=${encodeURIComponent(countryCode)}&
                zipcode=${encodeURIComponent(zipCode)}&
                latitude=${encodeURIComponent(latitude)}&
                longitude=${encodeURIComponent(longitude)}&
                method=${encodeURIComponent(calculationMethodId)}&
                juristic=${encodeURIComponent(asrMethodId)}&
                time_format=0`
            );
            if (!response.ok) throw new Error(`Failed to fetch prayer times from API. Status: ${response.status}`);
            const json = await response.json();

            const todayStr = new Date().toISOString().split("T")[0];
            prayerTimes = Object.entries(json.results).map(([date, times]) => ({
                date: date.replace(/-(\d)$/, "-0$1"), // Pad single digit days with leading zero
                times: [times.Fajr, times.Duha, times.Dhuhr, times.Asr, times.Maghrib, times.Isha]
            })).filter(entry => entry.date >= todayStr);

            if (prayerTimes.length === 0) throw new Error('No prayer times found from API.');

            await chrome.storage.local.set({ prayerTimes });
            utils.timeLog('Fetched and stored prayer times from API:', prayerTimes);
            return;
        }
        catch (error)
        {
            console.error('Error fetching prayer times from API:', error);
            return;
        }
    }
}

// const backgroundController = new BackgroundController();

// Used to keep the service worker alive
chrome.alarms.create({ periodInMinutes: .4 })
chrome.alarms.onAlarm.addListener(() =>
{
    console.log('Keeping service worker alive...')
});

chrome.runtime.onInstalled.addListener(async () =>
{
    await utils.populateStorage();
    utils.startPrayerTimeBadgeTask();
});
chrome.runtime.onStartup.addListener(async () =>
{
    utils.startPrayerTimeBadgeTask();
});

