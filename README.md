# Prayer Times / Namaz Vakitleri Chrome Extension

[Chrome Web Store](https://chromewebstore.google.com/detail/prayer-times-namaz-vakitl/oimnhapeodnoooifimgnjcbnjoedbiln)

---

## Description

Prayer Times / Namaz Vakitleri is a Chrome extension that allows users to view daily Islamic prayer times for their location. The extension fetches accurate prayer times either by scraping the official Diyanet site or using an API fallback. It also provides notifications and visual cues for current and upcoming prayers.

---

## Features

* Display daily prayer times based on your location.
* Automatic calculation of prayer times using multiple methods:
  * Jafari - Ithna Ashari
  * Karachi - University of Islamic Sciences
  * ISNA - Islamic Society of North America
  * MWL - Muslim World League
  * Mecca - Umm al-Qura
  * Egyptian General Authority of Survey
  * Diyanet İşleri Başkanlığı (official Turkey site)
  * And more...
* Asr Jurisdiction Method selection (Shafi, Hanbali, Maliki or Hanafi).
* Location search with autocomplete using OpenStreetMap Nominatim.
* Badge displaying the time remaining until the next prayer.
* Highlights the current prayer in the popup and changes background color when the prayer is marked as completed.

---

## Installation

1. Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/prayer-times-namaz-vakitl/oimnhapeodnoooifimgnjcbnjoedbiln).
2. Open the extension popup to set your location and preferred calculation methods.
3. The extension will automatically fetch and display prayer times.

---

## Usage

1. Open the popup by clicking the extension icon.
2. Select your desired **Prayer Calculation Method** and **Asr Jurisdiction Method** from the dropdown menus.
3. Click on the location field to type your city name, then press Enter.
4. Choose your location from the autocomplete results.
5. Daily prayer times will be displayed, with the current prayer highlighted.
6. Click on a prayer to mark it as prayed; the background color will change.

---

## Development

### Folder Structure

* `popup.js` - Handles the popup UI and interaction logic.
* `background.js` - Handles badge updates and background storage sync.
* `utils.js` - Utility functions and constants.
* `country-map.js` - Mapping of countries for API usage.
* `libs/fuse.min.mjs` - Fuzzy search library.
* `manifest.json` - Chrome extension manifest file.

### Running Locally

1. Clone the repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the cloned repository folder.

---

## Contributing

Contributions are welcome! Feel free to fork the repository and submit pull requests.

---

## License

This project is open-source and licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

## Links

* [GitHub Repository](https://github.com/9iiota/prayer-times-namaz-vakitleri-extension)
* [Chrome Web Store](https://chromewebstore.google.com/detail/prayer-times-namaz-vakitl/oimnhapeodnoooifimgnjcbnjoedbiln)
