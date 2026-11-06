
A retro-style study timer I created with AI assistance to track study sessions, manage topics, and plan my learning.

It started as a simple timer and gradually grew as I kept adding features I wanted to use.

## Features

- Track study time by topic, with daily, weekly, and total statistics.
    
- Set lesson goals and monitor progress.
    
- Enable 50-minute Pomodoro reminders.
    
- View study history in a monthly chart.
    
- Analyze YouTube playlists and generate study schedules.

### Focus Dashboard
<img width="1892" height="893" alt="focus-dashboard" src="https://github.com/user-attachments/assets/ab97517b-8c42-40ee-aaf3-dc2ad982bfff" />

### Study Analytics
<img width="1887" height="905" alt="study-analytics" src="https://github.com/user-attachments/assets/ddba2436-462c-4407-81b6-a6696d153e3a" />


### YouTube Playlist Analyzer
<img width="1891" height="900" alt="playlist-analyzer" src="https://github.com/user-attachments/assets/5d29d75b-cbfd-477a-b78d-9e467183c2bb" />


## Tech Stack

HTML · CSS · JavaScript · Chart.js · YouTube Data API v3

Study data is saved locally using `localStorage`. No account or database required.

## How to Run

Download the repository and open `index.html` in your browser.

No installation required.

## YouTube Playlist Analyzer

The timer works without an API key. Only the YouTube Playlist Analyzer requires one.

To get your own API key:

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project.
    
2. Enable **YouTube Data API v3** from the API Library.
    
3. Go to **APIs & Services → Credentials**.
    
4. Click **Create Credentials → API Key**.
    
5. Restrict the key to YouTube Data API v3 and your website's allowed HTTP referrers.
    
6. Open the deployed timer, enter your key, and click **ANALYZE**.
    

The key is stored temporarily in `sessionStorage` and can be removed using **CLEAR KEY**.

## Development

Built with AI assistance, from the initial timer to the additional tracking and planning features.

---

Made by [n3Xm@R](https://github.com/n3XmaR).
