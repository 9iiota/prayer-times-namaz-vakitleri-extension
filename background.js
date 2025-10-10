import * as utils from "./utils.js";

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
                        // this.onParametersChanged(changes.parameters);
                        break;
                    case "prayerTimes":
                        await this.onPrayerTimesChanged(changes.prayerTimes);

                        // notify popup (if open)
                        chrome.runtime.sendMessage({
                            action: "prayerTimesProcessed",
                            result: { status: "done" }
                        });

                        break;
                    default:
                        break;
                }
            }
        });
    }

    static instance = null;

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
        // console.log(change.newValue);
        // this.storage.parameters = change.newValue;
        // utils.timeLog('parameters changed from', change.oldValue, 'to', change.newValue);
    }

    async onPrayerTimesChanged(change)
    {
        this.storage.prayerTimes = change.newValue;
        utils.timeLog(`prayerTimes changed from ${change.oldValue?.length || 0} entries to ${change.newValue?.length || 0} entries`);
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