import { countryMap } from "./country-map.js";
import Fuse from "./libs/fuse.min.mjs";

export const ASR_JURISDICTION_METHOD_IDS =
{
    0: "Shafi, Hanbali, Maliki",
    1: "Hanafi",
}
export const COLORS =
{
    GREEN: "#00FF00",
    GRAY: "#808080",
    BLUE: "#0000FF",
    RED: "#FF0000",
    LIGHT_GREEN: "#baffde",
    LIGHT_BLUE: "#baebff",
    LIGHT_RED: "#ffbaba",

};
export const PRAYER_CALCULATION_METHOD_IDS =
{
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
export const PRAYER_NAMES = ["Fajr", "Sun", "Dhuhr", "Asr", "Maghrib", "Isha"];
export const STORAGE_DEFAULTS =
{
    isPrayed: false,
    parameters:
    {
        countryCode: null,
        zipCode: null,
        latitude: null,
        longitude: null,
        calculationMethodId: "13",
        asrMethodId: "0",
        country: null,
        state: null,
        city: null
    },
    prayerTimes: null
};
// let NEXT_PRAYER_INDEX, PRAYER_TIMES, IS_PRAYED, badgeText, badgeTextColor, badgeBackgroundColor, taskId, taskIntervallMs; TODO

export function getCurrentTimeFormatted(extraMinutes = 0)
{
    // Extra minutes can be added to current time for testing purposes
    const now = new Date();
    now.setMinutes(now.getMinutes() + extraMinutes);

    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

export function getCurrentPrayerIndex(todayPrayerTimes)
{
    const currentTime = getCurrentTimeFormatted();
    const passedTimes = todayPrayerTimes.times.filter(time => time <= currentTime);
    return passedTimes.length - 1; // Returns -1 if no prayers have passed yet
}

export async function timeLog(...args)
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

    console.log(`[${formatted}]`, ...args);
}

// export async function startPrayerTimeBadgeTask()
// {
//     if (taskId) clearTimeout(taskId);
//     await updatePrayerTimeBadge();
// }

// // TODO change function name
// export async function updatePrayerTimeBadge()
// {
//     if (!PRAYER_TIMES || !IS_PRAYED)
//     {
//         const storage = await getFromStorage(["prayerTimes", "isPrayed"]);
//         const { prayerTimes, isPrayed } = storage;
//         if (!prayerTimes || prayerTimes.length === 0) return;
//         if (isPrayed === undefined) return;
//         PRAYER_TIMES = prayerTimes;
//         IS_PRAYED = isPrayed;
//     }

//     // TODO needs to be done only once a day
//     const now = new Date();
//     const todayTimes = getPrayerTimesByDate(PRAYER_TIMES, now);
//     if (!todayTimes) throw new Error("No prayer times found for today");

//     let nextPrayerIndex = getCurrentPrayerIndex(todayTimes) + 1;
//     let nextPrayerTime;
//     if (nextPrayerIndex < todayTimes.times.length)
//     {
//         nextPrayerTime = todayTimes.times[nextPrayerIndex];
//     }
//     else
//     {
//         const tomorrow = new Date();
//         tomorrow.setDate(tomorrow.getDate() + 1);
//         const tomorrowTimes = getPrayerTimesByDate(PRAYER_TIMES, tomorrow);
//         if (!tomorrowTimes) throw new Error("No prayer times found for tomorrow");
//         nextPrayerIndex = 0;
//         nextPrayerTime = tomorrowTimes.times[nextPrayerIndex];
//     }

//     if (NEXT_PRAYER_INDEX === undefined)
//     {
//         NEXT_PRAYER_INDEX = nextPrayerIndex;
//     }
//     else if (NEXT_PRAYER_INDEX !== nextPrayerIndex)
//     {
//         NEXT_PRAYER_INDEX = nextPrayerIndex;
//         await saveToStorage("isPrayed", false);
//         IS_PRAYED = false;
//         displayTimes(todayTimes);
//     }

//     const timeDifference = getTimeDifference(getCurrentTimeFormatted(), nextPrayerTime);
//     if (badgeText !== timeDifference)
//     {
//         badgeText = timeDifference;
//         setBadgeText(timeDifference);
//     }

//     let backgroundColor;
//     if (timeDifference.includes("m"))
//     {
//         // Less than an hour remaining
//         backgroundColor = IS_PRAYED ? COLORS.GREEN : COLORS.RED;
//     }
//     else
//     {
//         // More than an hour remaining
//         backgroundColor = IS_PRAYED ? COLORS.GREEN : COLORS.BLUE;
//     }

//     if (badgeBackgroundColor !== backgroundColor)
//     {
//         setBadgeBackgroundColor(backgroundColor);
//         badgeBackgroundColor = backgroundColor;
//     }

//     const textColor = backgroundColor === COLORS.BLUE ? WHITE : BLACK;
//     if (badgeTextColor !== textColor)
//     {
//         setBadgeTextColor(textColor);
//         badgeTextColor = textColor;
//     }

//     if (timeDifference.includes("s"))
//     {
//         taskIntervallMs = 1000; // Set to 1 second
//     }
//     else
//     {
//         taskIntervallMs = msUntilNextMinute() + 1000; // Add a second to ensure we are in the next minute
//     }
//     taskId = setTimeout(updatePrayerTimeBadge, taskIntervallMs);
// }

// export async function setBadgeText(text)
// {
//     const currentText = await chrome.action.getBadgeText({});
//     if (text !== currentText)
//     {
//         chrome.action.setBadgeText({ text: text });
//         timeLog(`Badge text set to: ${text}`);
//     }
// }

// export async function setBadgeTextColor(color)
// {
//     chrome.action.setBadgeTextColor({ color: color });
//     timeLog(`Badge text color set to: ${color}`);
// }

// export async function setBadgeBackgroundColor(color)
// {
//     chrome.action.setBadgeBackgroundColor({ color: color });
//     timeLog(`Badge background color set to: ${color}`);
// }

// export function rgbaArrayToHex(colorArray)
// {
//     // Ensure at least RGB values are provided
//     if (colorArray.length < 3)
//     {
//         return false;
//     }

//     // Extract RGB values, ignore alpha for hex conversion
//     const [r, g, b] = colorArray;

//     // Convert each component to a two-digit hex string and concatenate
//     return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
// }

// export function msUntilNextMinute()
// {
//     const now = new Date();
//     const seconds = now.getSeconds();
//     const milliseconds = now.getMilliseconds();

//     return (60 - seconds) * 1000 - milliseconds;
// }

// export function getTimeDifference(startTime, endTime)
// {
//     // Convert HH:MM to total minutes
//     const [startH, startM] = startTime.split(':').map(Number);
//     const [endH, endM] = endTime.split(':').map(Number);

//     const totalStartMinutes = startH * 60 + startM;
//     const totalEndMinutes = endH * 60 + endM;

//     let timeDifferenceMinutes = totalEndMinutes - totalStartMinutes;

//     if (timeDifferenceMinutes === 1)
//     {
//         const secondsUntilNextMinute = msUntilNextMinute() / 1000;
//         return `${Math.ceil(secondsUntilNextMinute)}s`;
//     }
//     else if (timeDifferenceMinutes === 0)
//     {
//         return "0s";
//     }

//     // If the difference is negative, assume it's the next day
//     if (timeDifferenceMinutes < 0) timeDifferenceMinutes += 24 * 60;

//     const diffH = Math.floor(timeDifferenceMinutes / 60);
//     const diffM = timeDifferenceMinutes % 60;

//     // Pad with leading zero if needed
//     const pad = n => n.toString().padStart(2, '0');

//     return diffH === 0 ? `${diffM}m` : `${diffH}:${pad(diffM)}`;
// }