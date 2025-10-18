# Prayer Times (Namaz Vakitleri) Chrome Extension

[Chrome Web Store](https://chromewebstore.google.com/detail/prayer-times-namaz-vakitl/oimnhapeodnoooifimgnjcbnjoedbiln)

---

## Description

**Prayer Times (Namaz Vakitleri)** is a Chrome extension that allows users to view daily Islamic prayer times for their location.  
It fetches accurate prayer times from multiple reliable sources and provides notifications, badges, and visual indicators for upcoming and current prayers.

---

## Features

-   🌍 **Automatic location support** using OpenStreetMap Nominatim.
-   🕌 **Accurate daily prayer times** from:
    -   Diyanet İşleri Başkanlığı
    -   IslamVakti.com
    -   IslamicFinder API
-   🕐 **Dynamic badge** showing time until the next prayer.
-   🔔 **Smart notifications** configurable by minutes before prayer.
-   🧭 **Customizable calculation methods** (Jafari, ISNA, MWL, Diyanet, etc.).
-   🕌 **Asr Jurisdiction** selection (Shafi, Hanbali, Maliki or Hanafi).
-   💡 **Prayer display styles** (Grid, Flex, Columns).
-   ✅ **Interactive popup UI** with visual highlighting for current prayer.
-   🔄 **Auto-refresh** of prayer data when nearing the end of stored days.

---

## Installation

1. Download or install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/prayer-times-namaz-vakitl/oimnhapeodnoooifimgnjcbnjoedbiln).
2. Click on the extension icon to open the popup.
3. Configure your location and preferred settings.
4. Prayer times will automatically display and update daily.

---

## Usage

1. Click on the **extension icon** in Chrome’s toolbar.
2. Use the **location field** to type your city name (powered by Nominatim).
3. Select your **Prayer Calculation Method** and **Asr Method**.
4. Adjust **notification settings** and **display style** as desired.
5. The **badge** will show remaining time until the next prayer.
6. Click on a prayer time in the popup to mark it as _prayed_.

---

## Development

### Folder Structure

```
src/
├── assets/          # Icons and SVG assets
├── js/              # Core logic (background.js, popup.js, utils.js, etc.)
├── libs/            # External libraries (e.g. Fuse.js for fuzzy search)
├── pages/           # Popup HTML file
├── styles/          # Extension styling (CSS)
manifest.json        # Chrome extension manifest
```

### Key Scripts

-   **background.js** – Handles background logic, badge updates, notifications, and data fetching.
-   **popup.js** – Controls popup UI interactions and location search.
-   **utils.js** – Contains constants, helper functions, and default storage values.
-   **country-map.js** – Provides country mappings for APIs.
-   **fuse.min.mjs** – Enables fuzzy search for city/state names.

### Run Locally

1. Clone the repository:
    ```bash
    git clone https://github.com/9iiota/prayer-times-namaz-vakitleri-extension.git
    ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder.
5. The extension should now appear in your Chrome toolbar.

---

## Permissions

This extension requires the following permissions:

-   `storage` — Save user preferences and prayer times.
-   `alarms` — Keep background worker alive for periodic updates.
-   `notifications` — Display prayer notifications.
-   `idle` — Detect user activity to refresh prayer times.
-   Host permissions for:
    -   `namazvakitleri.diyanet.gov.tr`
    -   `islamvakti.com`
    -   `islamicfinder.us`
    -   `nominatim.openstreetmap.org`

---

## Contributing

Pull requests and contributions are welcome!  
If you'd like to suggest a feature or fix a bug, please open an issue on GitHub.

---

## License

This project is licensed under the **MIT License**.  
See [LICENSE](LICENSE) for details.

---

## Links

-   🌐 [GitHub Repository](https://github.com/9iiota/prayer-times-namaz-vakitleri-extension)
-   🛍️ [Chrome Web Store](https://chromewebstore.google.com/detail/prayer-times-namaz-vakitl/oimnhapeodnoooifimgnjcbnjoedbiln)
