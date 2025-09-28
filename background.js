import * as utils from "./utils.js";

class BackgroundController
{
    constructor(storage)
    {
        this.storage = storage;
        this.todayPrayerTimes = null;
        this.nextPrayerIndex = null;

        this.updateBadge();
        // this.startBadgeTask(); // TODO start badge task if prayer times exist

        chrome.storage.onChanged.addListener(async (changes, area) =>
        {
            if (area === 'local')
            {
                switch (changes)
                {
                    case changes.isPrayed:
                        this.onIsPrayedChanged(changes.isPrayed);
                        break;
                    case changes.parameters:
                        this.onParametersChanged(changes.parameters);
                        break;
                    case changes.prayerTimes:
                        this.onPrayerTimesChanged(changes.prayerTimes);
                        break;
                    default:
                        break;
                }
            }
        });
    }

    static async init()
    {
        try
        {
            const keys = Object.keys(utils.STORAGE_DEFAULTS);
            const existing = await chrome.storage.local.get(keys);

            // If existing already has a value for that key, use it
            // Otherwise, fall back to the default value in this.defaultStorageValues
            const merged = Object.fromEntries(
                keys.map(key => [key, existing[key] ?? utils.STORAGE_DEFAULTS[key]])
            );

            await chrome.storage.local.set(merged);
            utils.timeLog('Initialized storage with default values:', merged);
            return new BackgroundController(merged);
        }
        catch (error)
        {
            console.error('Error initializing storage:', error);
        }
    }

    async updateBadge()
    {
        if (!this.storage.prayerTimes || this.storage.prayerTimes.length === 0) throw new Error("No prayer times found in storage");

        if (!this.todayPrayerTimes)
        {
            this.todayPrayerTimes = await this.getDatePrayerTimes();
            if (!this.todayPrayerTimes) throw new Error("No prayer times found for today");
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
            this.nextPrayerIndex = nextPrayerIndex;
            await chrome.storage.local.set({ isPrayed: false });
            this.storage.isPrayed = false;
            chrome.runtime.sendMessage({ action: "prayerChanged", data: this.todayPrayerTimes });
        }
    }

    async onIsPrayedChanged(change)
    {
        this.storage.isPrayed = change.newValue;
        utils.timeLog('isPrayed changed from', change.oldValue, 'to', change.newValue);
        if (change.newValue)
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

    async onParametersChanged(change)
    {
        this.storage.parameters = change.newValue;
        utils.timeLog('parameters changed from', change.oldValue, 'to', change.newValue);

        // Send message to popup to fetch new prayer times if open
        chrome.runtime.sendMessage({ action: "parametersChanged", data: this.storage.parameters });
    }

    async onPrayerTimesChanged(change)
    {
        this.storage.prayerTimes = change.newValue;
        utils.timeLog('prayerTimes changed.');
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
}

// Used to keep the service worker alive
chrome.alarms.create({ periodInMinutes: .4 })
chrome.alarms.onAlarm.addListener(() =>
{
    console.log('Keeping service worker alive...')
});

chrome.runtime.onInstalled.addListener(async () =>
{
    // chrome.storage.local.clear();
    const backgroundController = await BackgroundController.init();
    // await utils.populateStorage();
    // utils.startPrayerTimeBadgeTask();
});
chrome.runtime.onStartup.addListener(async () =>
{
    const backgroundController = await BackgroundController.init();
    // utils.startPrayerTimeBadgeTask();
});

