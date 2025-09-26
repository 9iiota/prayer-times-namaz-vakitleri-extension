import * as utils from "./utils.js";

class BackgroundController
{
    constructor()
    {
        this.defaultStorageValues =
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

        // Initialize storage
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
                        const currentPrayerIndex = this.getCurrentPrayerIndex(todayPrayerTimes);
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
                    // TODO Update prayer times if parameters changed
                }
                else if (changes.prayerTimes)
                {
                    // TODO Try to update prayer times in DOM if prayerTimes changed
                }
            }
        });
    }

    async initializeStorage()
    {
        try
        {
            const keys = Object.keys(this.defaultStorageValues);
            const storage = await chrome.storage.sync.get(keys);

            const toSet = {};
            for (const key of keys)
            {
                if (storage[key] === undefined)
                {
                    toSet[key] = this.defaultStorageValues[key];
                }
            }

            if (Object.keys(toSet).length > 0)
            {
                await chrome.storage.sync.set(toSet);
                utils.timeLog('Initialized storage with default values:', toSet);
            }
            else
            {
                utils.timeLog('Storage already initialized.');
            }
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

    getCurrentTimeFormatted(extraMinutes = 0)
    {
        // Extra minutes can be added to current time for testing purposes
        const now = new Date();
        now.setMinutes(now.getMinutes() + extraMinutes);

        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    getCurrentPrayerIndex(todayPrayerTimes)
    {
        const currentTime = this.getCurrentTimeFormatted();
        const passedTimes = todayPrayerTimes.times.filter(time => time <= currentTime);
        return passedTimes.length - 1; // Returns -1 if no prayers have passed yet
    }

    getTimeFromNowBadgeFormatted(endTimeFormatted)
    {
        const startTimeFormatted = this.getCurrentTimeFormatted();
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

