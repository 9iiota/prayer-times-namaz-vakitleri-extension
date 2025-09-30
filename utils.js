export const ASR_JURISDICTION_METHOD_IDS =
{
    0: "Shafi, Hanbali, Maliki",
    1: "Hanafi",
}
export const COLORS =
{
    GREEN: "#00FF00",
    GRAY: "#808080",
    RED: "#FF0000",
    LIGHT_GREEN: "#baffde",
    LIGHT_BLUE: "#baebff",
    LIGHT_RED: "#ffbaba",
    BLACK: "#000000",
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
export const NOMINATIM_REQUEST_INTERVAL_MS = 2000; // Nominatim usage policy allows 1 request per second

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