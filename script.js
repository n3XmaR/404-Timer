let timer;
    let seconds = 0;
    let startTime = 0;
    let isPaused = false;
    let chartViewDate = new Date();
    let lastPomodoroMark = 0;
    let ytDurations = [];
    let ytPlaylistTitle = '';
    let ytRangeOffset = 1;
    let ytRangeApplied = false;

    const display = document.getElementById('display');
    const statusIndicator = document.getElementById('statusIndicator');
    const fieldSelect = document.getElementById('fieldSelect');
    const savedTimesDiv = document.getElementById('savedTimes');
    const newTopicInput = document.getElementById('newTopic');
    const newTopicLessonsInput = document.getElementById('newTopicLessons');
    const dailyTotalEl = document.getElementById('dailyTotal');
    const weeklyTotalEl = document.getElementById('weeklyTotal');
    const chartMonthLabel = document.getElementById('chartMonthLabel');
    const pomodoroBtn = document.getElementById('pomodoroBtn');

    const POMODORO_INTERVAL = 50 * 60; // 50 minutes

    // ---- data ----
    // Some browsers limit localStorage for file:// pages. Keep the app usable
    // without it; in that case data is temporary until the page is closed.
    const studyStorage = (() => {
      try {
        const store = window.localStorage;
        const testKey = '__404_timer_storage_test__';
        store.setItem(testKey, '1');
        store.removeItem(testKey);
        return store;
      } catch (error) {
        const temporaryData = new Map();
        const notice = document.getElementById('storageNotice');
        if (notice) {
          notice.hidden = false;
          notice.textContent = 'LOCAL STORAGE BLOCKED: The timer still works, but data may not survive a reload. Use the hosted version to save progress.';
        }
        return {
          getItem: key => temporaryData.get(key) ?? null,
          setItem: (key, value) => temporaryData.set(key, String(value)),
          removeItem: key => temporaryData.delete(key)
        };
      }
    })();

    let topics = JSON.parse(studyStorage.getItem('topicsData')) || {};
    let savedOrder = JSON.parse(studyStorage.getItem('studyOrder')) || [];
    let globalTotal = JSON.parse(studyStorage.getItem('globalTotalFocus')) || 0;
    let dailyData = JSON.parse(studyStorage.getItem('dailyData')) || { date: new Date().toDateString(), total: 0 };
    let studyHistory = JSON.parse(studyStorage.getItem('studyHistory')) || {};
    let pomodoroEnabled = JSON.parse(studyStorage.getItem('pomodoroEnabled')) || false;

    // migrate old data structure (studyTimes -> topics) if it exists
    (function migrateOldData() {
      const oldTimes = JSON.parse(studyStorage.getItem('studyTimes'));
      if (oldTimes && Object.keys(topics).length === 0) {
        Object.keys(oldTimes).forEach(k => {
          topics[k] = { time: oldTimes[k] || 0, total: 0, done: 0 };
        });
        saveData();
      }
    })();

    let myChart;

    function beep() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.connect(ctx.destination);

        const osc1 = ctx.createOscillator();
        osc1.type = 'square';
        osc1.frequency.value = 880;
        osc1.connect(gain);
        osc1.start();
        osc1.stop(ctx.currentTime + 0.25);

        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          osc2.type = 'square';
          osc2.frequency.value = 660;
          osc2.connect(gain);
          osc2.start();
          osc2.stop(ctx.currentTime + 0.25);
        }, 300);
      } catch (e) {
        console.log('Audio not supported', e);
      }
    }

    function pomodoroAlert() {
      beep();
      const prevText = statusIndicator.textContent;
      const prevColor = statusIndicator.style.color;
      statusIndicator.textContent = "POMODORO: 50 MIN REACHED";
      statusIndicator.style.color = "#00ffcc";
      display.classList.add('pomodoro-flash');
      setTimeout(() => {
        display.classList.remove('pomodoro-flash');
        if (timer) {
          statusIndicator.textContent = "RUNNING...";
          statusIndicator.style.color = "#00ff00";
        } else {
          statusIndicator.textContent = prevText;
          statusIndicator.style.color = prevColor;
        }
      }, 4000);
    }

    function refreshPomodoroBtn() {
      pomodoroBtn.textContent = pomodoroEnabled ? "POMODORO: ON" : "POMODORO: OFF";
      pomodoroBtn.style.color = pomodoroEnabled ? "#ff3333" : "#00ffcc";
      pomodoroBtn.style.borderColor = pomodoroEnabled ? "#ff3333" : "#00ffcc";
      pomodoroBtn.style.background = pomodoroEnabled ? "rgba(255,51,51,0.1)" : "rgba(0,255,204,0.1)";
    }

    pomodoroBtn.addEventListener('click', () => {
      pomodoroEnabled = !pomodoroEnabled;
      studyStorage.setItem('pomodoroEnabled', JSON.stringify(pomodoroEnabled));
      refreshPomodoroBtn();
    });

    function checkDailyReset() {
      const today = new Date().toDateString();
      if (dailyData.date !== today) {
        dailyData = { date: today, total: 0 };
        saveData();
      }
      dailyTotalEl.textContent = formatTime(dailyData.total);
    }

    function getWeekTotal() {
      const now = new Date();
      const day = now.getDay(); // 0 = Sunday
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - day);
      sunday.setHours(0, 0, 0, 0);

      let total = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        total += studyHistory[d.toDateString()] || 0;
      }
      return total;
    }

    function syncOrder() {
      const keys = Object.keys(topics);
      keys.forEach(key => {
        if (!savedOrder.includes(key)) {
          savedOrder.push(key);
        }
      });
      savedOrder = savedOrder.filter(key => keys.includes(key));
      saveData();
    }

    function saveData() {
      studyStorage.setItem('topicsData', JSON.stringify(topics));
      studyStorage.setItem('studyOrder', JSON.stringify(savedOrder));
      studyStorage.setItem('globalTotalFocus', JSON.stringify(globalTotal));
      studyStorage.setItem('dailyData', JSON.stringify(dailyData));
      studyStorage.setItem('studyHistory', JSON.stringify(studyHistory));
    }

    function updateSelect() {
      const currentSelection = fieldSelect.value;
      fieldSelect.innerHTML = '';

      savedOrder.forEach(topic => {
        const option = document.createElement('option');
        option.value = topic;
        option.textContent = topic;
        fieldSelect.appendChild(option);
      });

      const sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = '──────────';
      fieldSelect.appendChild(sep);

      const totalOption = document.createElement('option');
      totalOption.value = 'TOTAL_FOCUS_ALL';
      totalOption.textContent = '[ RESET SYSTEM_TOTAL ]';
      fieldSelect.appendChild(totalOption);

      const dailyOption = document.createElement('option');
      dailyOption.value = 'DAILY_FOCUS_RESET';
      dailyOption.textContent = '[ RESET DAILY_LOG ]';
      fieldSelect.appendChild(dailyOption);

      if (currentSelection) {
        fieldSelect.value = currentSelection;
      }

      if (typeof updateYtLinkOptions === 'function') updateYtLinkOptions();
    }

    function formatTime(sec) {
      const h = Math.floor(sec / 3600).toString().padStart(2, '0');
      const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
      const s = (sec % 60).toString().padStart(2, '0');
      return `${h}:${m}:${s}`;
    }


    // Offline fallback: draw the monthly analytics without the CDN library.
    function createNativeStudyChart(canvas) {
      const context = canvas.getContext('2d');
      const chart = {
        data: { labels: [], datasets: [{ data: [] }] },
        update() {
          const ratio = window.devicePixelRatio || 1;
          const width = Math.max(canvas.parentElement?.clientWidth || 320, 200);
          const height = Math.max(canvas.parentElement?.clientHeight || 300, 180);
          canvas.width = Math.round(width * ratio);
          canvas.height = Math.round(height * ratio);
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
          context.clearRect(0, 0, width, height);
          const left = 42, right = 14, top = 18, bottom = 36;
          const chartWidth = width - left - right;
          const chartHeight = height - top - bottom;
          const values = this.data.datasets[0].data.map(Number);
          const labels = this.data.labels;
          const maxHours = Math.max(10, Math.ceil(Math.max(0, ...values) / 2) * 2);
          context.font = '16px VT323, monospace';
          context.textAlign = 'right';
          context.textBaseline = 'middle';
          for (let i = 0; i <= 5; i++) {
            const hours = maxHours * i / 5;
            const y = top + chartHeight * (1 - i / 5);
            context.strokeStyle = 'rgba(255,255,255,0.10)';
            context.beginPath(); context.moveTo(left, y); context.lineTo(width - right, y); context.stroke();
            context.fillStyle = '#8892b0';
            context.fillText(hours.toFixed(hours % 1 === 0 ? 0 : 1), left - 9, y);
          }
          const xFor = index => left + (labels.length <= 1 ? 0 : index / (labels.length - 1) * chartWidth);
          context.textAlign = 'center';
          context.textBaseline = 'top';
          labels.forEach((label, i) => {
            if (i === 0 || i === labels.length - 1 || i % (width < 560 ? 5 : 3) === 0) {
              context.fillStyle = '#8892b0';
              context.fillText(label, xFor(i), top + chartHeight + 8);
            }
          });
          context.strokeStyle = '#00ffcc';
          context.lineWidth = 2;
          context.beginPath();
          values.forEach((val, i) => {
            const y = top + chartHeight * (1 - val / maxHours);
            if (i === 0) context.moveTo(xFor(i), y);
            else context.lineTo(xFor(i), y);
          });
          context.stroke();
          context.fillStyle = '#fff';
          values.forEach((val, i) => {
            if (val <= 0) return;
            const y = top + chartHeight * (1 - val / maxHours);
            context.beginPath(); context.arc(xFor(i), y, 3.5, 0, 2 * Math.PI); context.fill();
          });
        }
      };
      return chart;
    }

    function initChart() {
      const canvas = document.getElementById('studyChart');
      if (typeof Chart === 'undefined') {
        // Works when opened directly without an internet connection.
        myChart = createNativeStudyChart(canvas);
        return;
      }
      const ctx = canvas.getContext('2d');
      myChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'HOURS',
            data: [],
            borderColor: '#00ffcc',
            backgroundColor: '#00ffcc',
            borderWidth: 2,
            tension: 0,
            pointRadius: 4,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#00ffcc',
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              suggestedMax: 10,
              ticks: { stepSize: 1, color: '#8892b0', font: { family: 'VT323', size: 14 } },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            x: {
              ticks: { color: '#8892b0', font: { family: 'VT323', size: 14 } },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }

    function updateChart() {
      if (!myChart) return;

      const viewYear = chartViewDate.getFullYear();
      const viewMonth = chartViewDate.getMonth();

      const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
      chartMonthLabel.textContent = `${monthNames[viewMonth]} ${viewYear}`;

      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const labels = [];
      const dataPoints = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const tempDate = new Date(viewYear, viewMonth, d);
        const dateStr = tempDate.toDateString();

        labels.push(d);
        const secs = studyHistory[dateStr] || 0;
        dataPoints.push((secs / 3600).toFixed(2));
      }

      myChart.data.labels = labels;
      myChart.data.datasets[0].data = dataPoints;
      myChart.update();
    }

    document.getElementById('prevMonthBtn').addEventListener('click', () => {
      chartViewDate.setMonth(chartViewDate.getMonth() - 1);
      updateChart();
    });

    document.getElementById('nextMonthBtn').addEventListener('click', () => {
      chartViewDate.setMonth(chartViewDate.getMonth() + 1);
      updateChart();
    });

    function updateProgress(topic) {
      const data = topics[topic];
      if (!data) return;
      const input = prompt(`> UPDATE PROGRESS FOR: ${topic}\nCompleted lessons (out of ${data.total}):`, data.done);
      if (input === null) return;
      const num = parseInt(input);
      if (!isNaN(num) && num >= 0) {
        data.done = num;
        saveData();
        updateSavedTimes();
      }
    }

    function escapeHTML(value) {
      return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
    }

    function updateSavedTimes() {
      savedTimesDiv.innerHTML = '';
      savedOrder.forEach(field => {
        const data = topics[field];
        if (!data) return;

        const div = document.createElement('div');
        div.classList.add('task-item');
        div.setAttribute('draggable', 'true');
        div.setAttribute('data-topic', field);

        let progressHTML = '';
        if (data.total && data.total > 0) {
          const pct = Math.min(100, Math.round((data.done / data.total) * 100));
          progressHTML = `
            <div class="progress-row">
              <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
              <span class="progress-pct" data-topic-progress="${escapeHTML(field)}">${data.done}/${data.total} (${pct}%)</span>
            </div>`;
        }

        div.innerHTML = `
          <div class="task-top">
            <span>&gt; ${escapeHTML(field)}</span> <span>${formatTime(data.time)}</span>
          </div>
          ${progressHTML}
        `;

        div.addEventListener('dragstart', () => { div.classList.add('dragging'); });
        div.addEventListener('dragend', () => { div.classList.remove('dragging'); updateOrderFromDOM(); });

        savedTimesDiv.appendChild(div);
      });

      document.querySelectorAll('[data-topic-progress]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          updateProgress(el.getAttribute('data-topic-progress'));
        });
      });

      document.getElementById('grandTotal').textContent = formatTime(globalTotal);
      checkDailyReset();
      weeklyTotalEl.textContent = formatTime(getWeekTotal());
      updateChart();
    }

    function updateOrderFromDOM() {
      const items = savedTimesDiv.querySelectorAll('.task-item');
      savedOrder = [];
      items.forEach(item => {
        savedOrder.push(item.getAttribute('data-topic'));
      });
      saveData();
      updateSelect();
      updateChart();
    }

    savedTimesDiv.addEventListener('dragover', e => {
      e.preventDefault();
      const afterElement = getDragAfterElement(savedTimesDiv, e.clientY);
      const draggable = document.querySelector('.dragging');
      if (afterElement == null) {
        savedTimesDiv.appendChild(draggable);
      } else {
        savedTimesDiv.insertBefore(draggable, afterElement);
      }
    });

    function getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    syncOrder();
    checkDailyReset();
    initChart();
    updateSelect();
    updateSavedTimes();
    refreshPomodoroBtn();

    document.getElementById('addTopicBtn').addEventListener('click', () => {
      const topic = newTopicInput.value.trim();
      const lessons = parseInt(newTopicLessonsInput.value) || 0;
      if (topic && !topics[topic] && !topic.includes('RESET')) {
        topics[topic] = { time: 0, total: lessons, done: 0 };
        savedOrder.push(topic);
        saveData();
        updateSelect();
        updateSavedTimes();
        newTopicInput.value = '';
        newTopicLessonsInput.value = '';
      }
    });

    document.getElementById('removeTopicBtn').addEventListener('click', () => {
      const topic = fieldSelect.value;
      if (topic.includes('RESET') || topic.includes('──')) return;
      if (topic) {
        delete topics[topic];
        savedOrder = savedOrder.filter(t => t !== topic);
        saveData();
        updateSelect();
        updateSavedTimes();
      }
    });

    document.getElementById('startBtn').addEventListener('click', () => {
      const field = fieldSelect.value;
      if (field.includes('RESET') || field.includes('──')) return;

      if (!timer) {
        checkDailyReset();
        statusIndicator.textContent = "RUNNING...";
        statusIndicator.style.color = "#00ff00";
        isPaused = false;

        startTime = Date.now() - (seconds * 1000);

        timer = setInterval(() => {
          const now = Date.now();
          const diff = now - startTime;
          seconds = Math.floor(diff / 1000);
          display.textContent = formatTime(seconds);

          if (pomodoroEnabled && seconds > 0 && seconds % POMODORO_INTERVAL === 0 && seconds !== lastPomodoroMark) {
            lastPomodoroMark = seconds;
            pomodoroAlert();
          }
        }, 1000);
      }
    });

    document.getElementById('pauseBtn').addEventListener('click', () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
        isPaused = true;
        statusIndicator.textContent = "SUSPENDED";
        statusIndicator.style.color = "#ffa500";
      }
    });

    document.getElementById('stopBtn').addEventListener('click', () => {
      if (timer || isPaused) {
        clearInterval(timer);
        timer = null;
        isPaused = false;
        statusIndicator.textContent = "HALTED";
        statusIndicator.style.color = "#ff0000";

        const field = fieldSelect.value;
        if (field && !field.includes('RESET') && topics[field]) {
          topics[field].time += seconds;
          globalTotal += seconds;
          dailyData.total += seconds;

          const todayKey = new Date().toDateString();
          if (!studyHistory[todayKey]) studyHistory[todayKey] = 0;
          studyHistory[todayKey] += seconds;

          saveData();
          updateSavedTimes();
        }
        seconds = 0;
        lastPomodoroMark = 0;
        display.textContent = "00:00:00";
      }
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
      const field = fieldSelect.value;
      if (field === 'TOTAL_FOCUS_ALL') {
        globalTotal = 0;
      } else if (field === 'DAILY_FOCUS_RESET') {
        dailyData.total = 0;
      } else if (field && !field.includes('──') && topics[field]) {
        topics[field].time = 0;
      }
      saveData();
      updateSavedTimes();
    });

    // =====================================================
    // ---- YouTube Playlist Analyzer ----
    // =====================================================
// The visitor supplies their own key. Never commit API keys to source code.
const ytApiKeyInput = document.getElementById('ytApiKey');
try {
  ytApiKeyInput.value = sessionStorage.getItem('ytApiKey') || '';
} catch (e) {
  // Storage may be disabled; typing the key will still work.
}

ytApiKeyInput.addEventListener('input', () => {
  try {
    if (ytApiKeyInput.value.trim()) {
      sessionStorage.setItem('ytApiKey', ytApiKeyInput.value.trim());
    } else {
      sessionStorage.removeItem('ytApiKey');
    }
  } catch (e) { /* Browser storage may be disabled. */ }
});

document.getElementById('ytClearKeyBtn').addEventListener('click', () => {
  ytApiKeyInput.value = '';
  try { sessionStorage.removeItem('ytApiKey'); } catch (e) {}
});

    function parseISO8601Duration(iso) {
      const match = (iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 0;
      const h = parseInt(match[1] || 0, 10);
      const m = parseInt(match[2] || 0, 10);
      const s = parseInt(match[3] || 0, 10);
      return h * 3600 + m * 60 + s;
    }

    function extractPlaylistId(input) {
      input = (input || '').trim();
      const listMatch = input.match(/[?&]list=([^&]+)/);
      if (listMatch) return listMatch[1];
      if (/^[A-Za-z0-9_-]{10,}$/.test(input)) return input;
      return null;
    }

    function formatLongTime(sec) {
      sec = Math.max(0, Math.round(sec));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}h ${m}m ${s}s`;
    }

    function formatShortDuration(sec) {
      sec = Math.max(0, Math.round(sec));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const parts = [];
      if (h > 0) parts.push(h + 'h');
      if (m > 0) parts.push(m + 'm');
      if (s > 0 || parts.length === 0) parts.push(s + 's');
      return parts.join(' ');
    }

    function formatPlanDate(date) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }

    function formatPlanDay(date) {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return days[date.getDay()];
    }

    function renderDailyPlan(plan) {
      const wrapper = document.getElementById('ytDailyPlanWrapper');
      const body = document.getElementById('ytDailyPlanBody');
      if (!wrapper || !body) return;

      if (!plan || plan.length === 0) {
        wrapper.style.display = 'none';
        body.innerHTML = '';
        return;
      }

      wrapper.style.display = 'block';
      body.innerHTML = '';
      plan.forEach(day => {
        const tr = document.createElement('tr');
        const videosLabel = day.startVideo === day.endVideo
          ? `#${ytRangeOffset + day.startVideo}`
          : `#${ytRangeOffset + day.startVideo}-#${ytRangeOffset + day.endVideo}`;
        tr.innerHTML = `
          <td>${formatPlanDate(day.date)}</td>
          <td>${formatPlanDay(day.date)}</td>
          <td>${videosLabel}</td>
          <td>${formatShortDuration(day.watchTime)}</td>
        `;
        body.appendChild(tr);
      });
    }

    async function fetchPlaylistDurations(playlistId, apiKey) {
      let videoIds = [];
      let pageToken = '';
      let guard = 0;
      do {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `HTTP ${res.status} while fetching playlist items`);
        }
        const data = await res.json();
        (data.items || []).forEach(item => {
          if (item.contentDetails && item.contentDetails.videoId) videoIds.push(item.contentDetails.videoId);
        });
        pageToken = data.nextPageToken || '';
        guard++;
      } while (pageToken && guard < 10 && videoIds.length < 500);

      let durations = [];
      for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batch.join(',')}&key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `HTTP ${res.status} while fetching video durations`);
        }
        const data = await res.json();
        (data.items || []).forEach(item => {
          durations.push(parseISO8601Duration(item.contentDetails.duration));
        });
      }
      return durations;
    }

    async function fetchPlaylistTitle(playlistId, apiKey) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.items?.[0]?.snippet?.title || 'YouTube Playlist';
      } catch (e) {
        return 'YouTube Playlist';
      }
    }

    function updateYtLinkOptions(forceReset) {
      const sel = document.getElementById('ytLinkTopic');
      if (!sel) return;
      const current = forceReset ? '__none__' : sel.value;
      sel.innerHTML = '';

      const noneOpt = document.createElement('option');
      noneOpt.value = '__none__';
      noneOpt.textContent = "-- Don't link, just calculate --";
      sel.appendChild(noneOpt);

      const newOpt = document.createElement('option');
      newOpt.value = '__new__';
      newOpt.textContent = `+ Create new topic: "${ytPlaylistTitle || 'Untitled Playlist'}"`;
      sel.appendChild(newOpt);

      savedOrder.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        sel.appendChild(opt);
      });

      const values = [...sel.options].map(o => o.value);
      sel.value = values.includes(current) ? current : '__none__';
    }

    function renderYtResults() {
      const total = ytDurations.reduce((a, b) => a + b, 0);
      document.getElementById('ytVideoCount').textContent = ytDurations.length;
      document.getElementById('ytRangeLabel').textContent = ytRangeApplied
        ? `(#${ytRangeOffset}-#${ytRangeOffset + ytDurations.length - 1})`
        : '';
      document.getElementById('ytTotalDuration').textContent = formatLongTime(total);
      document.getElementById('yt125x').textContent = formatLongTime(total / 1.25);
      document.getElementById('yt15x').textContent = formatLongTime(total / 1.5);
      document.getElementById('yt2x').textContent = formatLongTime(total / 2);
      document.getElementById('ytResults').style.display = 'block';

      // Reset leftover state from any previously analyzed playlist
      document.getElementById('ytWatchedCount').value = 0;
      document.getElementById('ytWatchedCount').max = ytDurations.length;
      updateYtLinkOptions(true);
      updateYtSchedule();
    }

    function updateYtSchedule() {
      const pctEl = document.getElementById('ytSchedPct');
      const videosEl = document.getElementById('ytSchedVideos');
      const dateEl = document.getElementById('ytSchedDate');
      const daysEl = document.getElementById('ytSchedDays');
      const ringEl = document.getElementById('ytSchedRing');

      if (ytDurations.length === 0) return;

      const watched = Math.min(Math.max(parseInt(document.getElementById('ytWatchedCount').value) || 0, 0), ytDurations.length);
      const remainingSeconds = ytDurations.slice(watched).reduce((a, b) => a + b, 0);

      const pct = ytDurations.length ? Math.round((watched / ytDurations.length) * 100) : 0;
      pctEl.textContent = pct + '%';
      videosEl.textContent = `${watched}/${ytDurations.length}`;

      const circumference = 326.7;
      const offset = circumference - (circumference * pct / 100);
      ringEl.setAttribute('stroke-dashoffset', offset);

      if (remainingSeconds <= 0) {
        dateEl.textContent = "Done!";
        daysEl.textContent = "You've finished this playlist";
        renderDailyPlan([]);
        return;
      }

      const hours = parseInt(document.getElementById('ytSchedHours').value) || 0;
      const minutes = parseInt(document.getElementById('ytSchedMinutes').value) || 0;
      const speed = parseFloat(document.getElementById('ytSchedSpeed').value) || 1;
      const startToday = document.getElementById('ytStartToday').checked;
      const selectedDays = [...document.querySelectorAll('.yt-sched-day:checked')].map(cb => parseInt(cb.value));

      const perDaySeconds = (hours * 3600 + minutes * 60) * speed;

      if (perDaySeconds <= 0 || selectedDays.length === 0) {
        dateEl.textContent = "—";
        daysEl.textContent = "Enter hours/day and pick at least one day";
        renderDailyPlan([]);
        return;
      }

      // Walk day-by-day, consuming whole videos into each watching day
      let videoIndex = watched;
      let cursorDate = new Date();
      if (!startToday) cursorDate.setDate(cursorDate.getDate() + 1);
      let guard = 0;
      const plan = [];

      while (videoIndex < ytDurations.length && guard < 3650) {
        if (selectedDays.includes(cursorDate.getDay())) {
          const startIdx = videoIndex;
          let dayTime = 0;
          while (videoIndex < ytDurations.length) {
            const dur = ytDurations[videoIndex];
            if (dayTime > 0 && dayTime + dur > perDaySeconds) break;
            dayTime += dur;
            videoIndex++;
            if (dayTime >= perDaySeconds) break;
          }
          plan.push({
            date: new Date(cursorDate),
            startVideo: startIdx,
            endVideo: videoIndex - 1,
            watchTime: dayTime
          });
        }
        cursorDate.setDate(cursorDate.getDate() + 1);
        guard++;
      }

      if (plan.length > 0) {
        const last = plan[plan.length - 1];
        dateEl.textContent = last.date.toDateString();
        daysEl.textContent = plan.length === 1 ? "1 day of study" : `${plan.length} days of study`;
      } else {
        dateEl.textContent = "—";
        daysEl.textContent = "Not enough time to schedule";
      }

      renderDailyPlan(plan);
    }

    document.getElementById('ytAnalyzeBtn').addEventListener('click', async () => {
      const urlInput = document.getElementById('ytPlaylistUrl').value.trim();
      const apiKey = ytApiKeyInput.value.trim();
      const statusEl = document.getElementById('ytStatus');

      document.getElementById('ytResults').style.display = 'none';

      const playlistId = extractPlaylistId(urlInput);
      if (!playlistId) { statusEl.textContent = 'ERROR: Invalid playlist link or ID.'; return; }
      if (!apiKey) { statusEl.textContent = 'ERROR: Enter your YouTube Data API key above first.'; return; }

      statusEl.textContent = 'ANALYZING...';
      try {
        const allDurations = await fetchPlaylistDurations(playlistId, apiKey);
        if (allDurations.length === 0) throw new Error('No videos found. Check the playlist link.');

        const rangeStartRaw = document.getElementById('ytRangeStart').value.trim();
        const rangeEndRaw = document.getElementById('ytRangeEnd').value.trim();
        ytRangeApplied = !!(rangeStartRaw || rangeEndRaw);

        let rangeStart = parseInt(rangeStartRaw) || 1;
        let rangeEnd = parseInt(rangeEndRaw) || allDurations.length;
        rangeStart = Math.max(1, Math.min(rangeStart, allDurations.length));
        rangeEnd = Math.max(rangeStart, Math.min(rangeEnd, allDurations.length));

        ytRangeOffset = rangeStart;
        ytDurations = allDurations.slice(rangeStart - 1, rangeEnd);

        ytPlaylistTitle = await fetchPlaylistTitle(playlistId, apiKey);
        statusEl.textContent = '';
        renderYtResults();
      } catch (err) {
        statusEl.textContent = 'ERROR: ' + err.message;
      }
    });

    document.getElementById('ytLinkTopic').addEventListener('change', () => {
      const val = document.getElementById('ytLinkTopic').value;
      const watchedInput = document.getElementById('ytWatchedCount');
      if (val !== '__none__' && val !== '__new__' && topics[val]) {
        watchedInput.value = topics[val].done || 0;
      }
      updateYtSchedule();
    });

    document.getElementById('ytSaveToTopicBtn').addEventListener('click', () => {
      const val = document.getElementById('ytLinkTopic').value;
      const watched = Math.min(Math.max(parseInt(document.getElementById('ytWatchedCount').value) || 0, 0), ytDurations.length);
      if (val === '__none__' || ytDurations.length === 0) return;

      if (val === '__new__') {
        let name = ytPlaylistTitle || 'YouTube Playlist';
        let finalName = name;
        let i = 2;
        while (topics[finalName]) { finalName = `${name} (${i})`; i++; }
        topics[finalName] = { time: 0, total: ytDurations.length, done: watched };
        savedOrder.push(finalName);
        saveData();
        updateSelect();
        updateSavedTimes();
        document.getElementById('ytLinkTopic').value = finalName;
        alert(`Created topic "${finalName}" with ${ytDurations.length} lessons.`);
      } else if (topics[val]) {
        if (topics[val].total > 0 && topics[val].total !== ytDurations.length) {
          if (!confirm(`Topic "${val}" already has ${topics[val].total} total lessons. Overwrite with ${ytDurations.length}?`)) return;
        }
        topics[val].total = ytDurations.length;
        topics[val].done = watched;
        saveData();
        updateSavedTimes();
        alert(`Updated "${val}" progress.`);
      }
    });

    ['ytSchedHours', 'ytSchedMinutes', 'ytSchedSpeed', 'ytStartToday', 'ytWatchedCount'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input', updateYtSchedule);
      el.addEventListener('change', updateYtSchedule);
    });
    document.querySelectorAll('.yt-sched-day').forEach(cb => cb.addEventListener('change', updateYtSchedule));

    updateYtLinkOptions();

// When using the built-in chart renderer, redraw on browser resize.
window.addEventListener('resize', () => {
  if (typeof Chart === 'undefined' && myChart) myChart.update();
});
