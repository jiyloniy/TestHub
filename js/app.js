/* ============================================
   TestHub - Application Logic
   ============================================ */

// --- State ---
const state = {
    mode: null, // 'python' | 'database'
    questions: [],
    currentIndex: 0,
    score: { correct: 0, wrong: 0, skipped: 0 },
    answers: [],
    isAnswered: false,
    isRevealed: false,

    // Python timer
    pythonTimeLeft: 300, // 5 minutes
    pythonTimerInterval: null,
    startTime: null,

    // Database timer
    dbTimerInterval: null,
    dbTimeLeft: 5,

    // Auto-advance
    autoAdvanceTimeout: null,
};

// --- Data ---
let pythonData = null;
let databaseData = null;

const QUESTIONS_COUNT = 30;
const PYTHON_TIME_LIMIT = 300; // seconds
const DB_QUESTION_TIME = 5; // seconds
const CORRECT_DELAY = 3000; // ms
const WRONG_DELAY = 4000; // ms

// Circle circumference for timer ring (r=52)
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // ≈ 326.73
// Score ring circumference (r=78)
const SCORE_CIRCUMFERENCE = 2 * Math.PI * 78; // ≈ 490.09

// --- Init ---
document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        const [pyRes, dbRes] = await Promise.all([
            fetch('./python_test_questions.json'),
            fetch('./database_questions.json')
        ]);

        if (!pyRes.ok || !dbRes.ok) throw new Error('Failed to load data');

        pythonData = await pyRes.json();
        databaseData = await dbRes.json();

        // Small delay for smooth loading feel
        await delay(500);
        showScreen('home-screen');
    } catch (err) {
        console.error('Data loading error:', err);
        document.querySelector('.loader span').textContent =
            'Ma\'lumotlarni yuklashda xatolik. Live Server ishlatayotganingizni tekshiring.';
        document.querySelector('.loader-ring').style.borderTopColor = '#ef4444';
    }
}

// --- Screen Management ---
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(id);
    if (screen) {
        screen.classList.add('active');
        screen.scrollTop = 0;
    }
}

// --- Quiz Start ---
function startQuiz(mode) {
    state.mode = mode;
    state.currentIndex = 0;
    state.score = { correct: 0, wrong: 0, skipped: 0 };
    state.answers = [];
    state.isAnswered = false;
    state.isRevealed = false;
    state.startTime = Date.now();

    const sourceQuestions = mode === 'python'
        ? pythonData.questions
        : databaseData.questions;

    state.questions = getRandomQuestions(sourceQuestions, QUESTIONS_COUNT);

    if (mode === 'python') {
        state.pythonTimeLeft = PYTHON_TIME_LIMIT;
        document.getElementById('python-total').textContent = QUESTIONS_COUNT;
        showScreen('python-screen');
        showPythonQuestion();
        startPythonTimer();
    } else {
        document.getElementById('db-total').textContent = QUESTIONS_COUNT;
        showScreen('database-screen');
        showDatabaseQuestion();
    }
}

// --- Random Question Selector ---
function getRandomQuestions(arr, count) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ============================================
//  PYTHON QUIZ LOGIC
// ============================================

function showPythonQuestion() {
    const q = state.questions[state.currentIndex];
    if (!q) return endPythonQuiz();

    state.isAnswered = false;

    // Update counter
    document.getElementById('python-current').textContent = state.currentIndex + 1;

    // Update progress
    const pct = ((state.currentIndex) / QUESTIONS_COUNT) * 100;
    document.getElementById('python-progress').style.width = pct + '%';

    // Question card
    const card = document.getElementById('python-question-card');
    const optionsList = document.getElementById('python-options');

    // Animate out
    card.classList.add('fade-out');
    optionsList.classList.add('fade-out');

    setTimeout(() => {
        // Update content
        document.getElementById('python-q-num').textContent = `Savol ${state.currentIndex + 1}`;
        document.getElementById('python-q-text').textContent = q.question;

        // Code block
        const codeWrap = document.getElementById('python-code-wrap');
        const codeBlock = document.getElementById('python-code-block');
        if (q.code) {
            codeBlock.textContent = q.code;
            codeWrap.classList.add('visible');
        } else {
            codeWrap.classList.remove('visible');
        }

        // Options
        optionsList.innerHTML = '';
        const keys = ['A', 'B', 'C', 'D'];
        keys.forEach(key => {
            if (q.options[key]) {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.dataset.key = key;
                btn.innerHTML = `
                    <span class="option-key">${key}</span>
                    <span class="option-text">${escapeHtml(q.options[key])}</span>
                `;
                btn.addEventListener('click', () => selectOption(key));
                optionsList.appendChild(btn);
            }
        });

        // Show skip button
        document.getElementById('btn-skip').classList.remove('hidden');

        // Animate in
        card.classList.remove('fade-out');
        card.classList.add('fade-in');
        optionsList.classList.remove('fade-out');
        optionsList.classList.add('fade-in');

        setTimeout(() => {
            card.classList.remove('fade-in');
            optionsList.classList.remove('fade-in');
        }, 400);
    }, 150);
}

function selectOption(key) {
    if (state.isAnswered) return;
    state.isAnswered = true;

    const q = state.questions[state.currentIndex];
    const isCorrect = key === q.correctAnswer;
    const buttons = document.querySelectorAll('#python-options .option-btn');

    // Hide skip
    document.getElementById('btn-skip').classList.add('hidden');

    // Mark buttons
    buttons.forEach(btn => {
        const btnKey = btn.dataset.key;
        if (btnKey === key && isCorrect) {
            btn.classList.add('selected-correct');
        } else if (btnKey === key && !isCorrect) {
            btn.classList.add('selected-wrong');
        } else if (btnKey === q.correctAnswer && !isCorrect) {
            btn.classList.add('reveal-correct');
        } else {
            btn.classList.add('disabled');
        }
    });

    // Update score
    if (isCorrect) {
        state.score.correct++;
    } else {
        state.score.wrong++;
    }

    // Save answer
    state.answers.push({
        questionId: q.id,
        question: q.question,
        selected: key,
        selectedText: q.options[key],
        correct: q.correctAnswer,
        correctText: q.options[q.correctAnswer],
        isCorrect: isCorrect
    });

    // Auto-advance bar
    const advanceTime = isCorrect ? CORRECT_DELAY : WRONG_DELAY;
    showAutoAdvanceBar(isCorrect, advanceTime);

    // Auto advance
    state.autoAdvanceTimeout = setTimeout(() => {
        hideAutoAdvanceBar();
        state.currentIndex++;
        if (state.currentIndex >= QUESTIONS_COUNT) {
            endPythonQuiz();
        } else {
            showPythonQuestion();
        }
    }, advanceTime);
}

function skipQuestion() {
    if (state.isAnswered) return;

    const q = state.questions[state.currentIndex];
    state.score.skipped++;
    state.answers.push({
        questionId: q.id,
        question: q.question,
        selected: null,
        selectedText: null,
        correct: q.correctAnswer,
        correctText: q.options[q.correctAnswer],
        isCorrect: false,
        skipped: true
    });

    state.currentIndex++;
    if (state.currentIndex >= QUESTIONS_COUNT) {
        endPythonQuiz();
    } else {
        showPythonQuestion();
    }
}

function showAutoAdvanceBar(isCorrect, duration) {
    const bar = document.getElementById('auto-advance-bar');
    const fill = document.getElementById('auto-advance-fill');

    fill.className = 'auto-advance-fill';
    fill.style.width = '0';
    bar.classList.add('visible');

    // Force reflow
    void fill.offsetWidth;

    fill.classList.add(isCorrect ? 'correct-fill' : 'wrong-fill');
    fill.classList.add('animating');
    fill.style.transitionDuration = duration + 'ms';
    fill.style.width = '100%';
}

function hideAutoAdvanceBar() {
    const bar = document.getElementById('auto-advance-bar');
    const fill = document.getElementById('auto-advance-fill');
    bar.classList.remove('visible');
    fill.className = 'auto-advance-fill';
    fill.style.width = '0';
}

// --- Python Timer ---
function startPythonTimer() {
    clearInterval(state.pythonTimerInterval);
    updatePythonTimerDisplay();

    state.pythonTimerInterval = setInterval(() => {
        state.pythonTimeLeft--;

        if (state.pythonTimeLeft <= 0) {
            state.pythonTimeLeft = 0;
            clearInterval(state.pythonTimerInterval);
            endPythonQuiz();
            return;
        }

        updatePythonTimerDisplay();

        // Urgent state when < 60s
        const timerEl = document.getElementById('python-timer');
        if (state.pythonTimeLeft <= 60) {
            timerEl.classList.add('urgent');
        } else {
            timerEl.classList.remove('urgent');
        }
    }, 1000);
}

function updatePythonTimerDisplay() {
    document.getElementById('python-timer-text').textContent =
        formatTime(state.pythonTimeLeft);
}

function endPythonQuiz() {
    clearInterval(state.pythonTimerInterval);
    clearTimeout(state.autoAdvanceTimeout);
    hideAutoAdvanceBar();
    document.getElementById('python-timer').classList.remove('urgent');

    // Fill remaining unanswered questions as skipped
    // Use answers.length to avoid double-counting if timer expired mid-advance
    for (let i = state.answers.length; i < state.questions.length; i++) {
        const q = state.questions[i];
        state.score.skipped++;
        state.answers.push({
            questionId: q.id,
            question: q.question,
            selected: null,
            selectedText: null,
            correct: q.correctAnswer,
            correctText: q.options[q.correctAnswer],
            isCorrect: false,
            skipped: true
        });
    }

    showResults('python');
}

// ============================================
//  DATABASE LOGIC
// ============================================

function showDatabaseQuestion() {
    const q = state.questions[state.currentIndex];
    if (!q) return endDatabaseQuiz();

    state.isRevealed = false;

    // Update counter
    document.getElementById('db-current').textContent = state.currentIndex + 1;

    // Update progress
    const pct = ((state.currentIndex) / QUESTIONS_COUNT) * 100;
    document.getElementById('db-progress').style.width = pct + '%';

    // Question content
    const card = document.getElementById('db-question-card');
    card.classList.add('fade-out');

    setTimeout(() => {
        document.getElementById('db-q-num').textContent = `Savol ${state.currentIndex + 1}`;
        document.getElementById('db-q-text').textContent = q.question;

        // Hide answer
        const answerCard = document.getElementById('db-answer-card');
        answerCard.classList.remove('visible');

        // Hide next button
        const nextBtn = document.getElementById('btn-next-db');
        nextBtn.classList.remove('visible');

        // Reset & show timer
        const timerWrap = document.getElementById('db-timer-wrap');
        timerWrap.classList.remove('hidden-timer');

        const circle = document.getElementById('timer-ring-circle');
        circle.classList.remove('urgent-ring');
        circle.style.strokeDashoffset = '0';

        const numberEl = document.getElementById('db-timer-number');
        numberEl.textContent = '5';
        state.dbTimeLeft = DB_QUESTION_TIME;

        card.classList.remove('fade-out');
        card.classList.add('fade-in');

        setTimeout(() => {
            card.classList.remove('fade-in');
        }, 400);

        // Start countdown after brief pause
        setTimeout(() => startDbCountdown(), 300);
    }, 150);
}

function startDbCountdown() {
    clearInterval(state.dbTimerInterval);
    state.dbTimeLeft = DB_QUESTION_TIME;

    const circle = document.getElementById('timer-ring-circle');
    const numberEl = document.getElementById('db-timer-number');

    // Animate circle: each second remove 1/5 of circumference
    const stepOffset = RING_CIRCUMFERENCE / DB_QUESTION_TIME;

    state.dbTimerInterval = setInterval(() => {
        state.dbTimeLeft--;

        // Update number with pop effect
        numberEl.textContent = state.dbTimeLeft;
        numberEl.classList.add('pop');
        setTimeout(() => numberEl.classList.remove('pop'), 300);

        // Update circle
        const offset = (DB_QUESTION_TIME - state.dbTimeLeft) * stepOffset;
        circle.style.strokeDashoffset = offset;

        // Urgent when <= 2
        if (state.dbTimeLeft <= 2) {
            circle.classList.add('urgent-ring');
        }

        if (state.dbTimeLeft <= 0) {
            clearInterval(state.dbTimerInterval);
            revealDatabaseAnswer();
        }
    }, 1000);
}

function revealDatabaseAnswer() {
    state.isRevealed = true;
    const q = state.questions[state.currentIndex];

    // Hide timer
    const timerWrap = document.getElementById('db-timer-wrap');
    timerWrap.classList.add('hidden-timer');

    // Show answer
    const answerCard = document.getElementById('db-answer-card');
    document.getElementById('db-answer-text').textContent = q.answer;

    // Keywords
    const keywordsEl = document.getElementById('db-answer-keywords');
    keywordsEl.innerHTML = '';
    if (q.keywords && q.keywords.length > 0) {
        q.keywords.forEach(kw => {
            const tag = document.createElement('span');
            tag.className = 'keyword-tag';
            tag.textContent = kw;
            keywordsEl.appendChild(tag);
        });
    }

    setTimeout(() => answerCard.classList.add('visible'), 100);

    // Show next button
    setTimeout(() => {
        const nextBtn = document.getElementById('btn-next-db');
        nextBtn.classList.add('visible');
    }, 400);
}

function nextDatabaseQuestion() {
    clearInterval(state.dbTimerInterval);
    state.currentIndex++;

    if (state.currentIndex >= QUESTIONS_COUNT) {
        endDatabaseQuiz();
    } else {
        showDatabaseQuestion();
    }
}

function endDatabaseQuiz() {
    clearInterval(state.dbTimerInterval);
    showResults('database');
}

// ============================================
//  RESULTS
// ============================================

function showResults(type) {
    showScreen('results-screen');

    // Reset review
    const reviewSection = document.getElementById('review-section');
    reviewSection.classList.remove('visible');

    const timeElapsed = Math.floor((Date.now() - state.startTime) / 1000);

    if (type === 'python') {
        const total = QUESTIONS_COUNT;
        const correct = state.score.correct;
        const wrong = state.score.wrong;
        const skipped = state.score.skipped;
        const pct = Math.round((correct / total) * 100);

        // Emoji & title
        let emoji, title;
        if (pct >= 90) { emoji = '🏆'; title = 'Ajoyib natija!'; }
        else if (pct >= 70) { emoji = '🎉'; title = 'Yaxshi natija!'; }
        else if (pct >= 50) { emoji = '👍'; title = 'O\'rtacha natija'; }
        else { emoji = '💪'; title = 'Ko\'proq mashq qiling'; }

        document.getElementById('results-emoji').textContent = emoji;
        document.getElementById('results-title').textContent = title;
        document.getElementById('results-subtitle').textContent =
            `Python dasturlash tili bo'yicha test yakunlandi`;

        // Score ring
        const scoreRing = document.getElementById('score-ring-fill');
        scoreRing.classList.remove('db-ring');
        const targetOffset = SCORE_CIRCUMFERENCE - (SCORE_CIRCUMFERENCE * pct / 100);
        setTimeout(() => {
            scoreRing.style.strokeDashoffset = targetOffset;
        }, 100);

        document.getElementById('score-percent').textContent = pct + '%';
        document.getElementById('score-fraction').textContent = `${correct}/${total}`;

        // Stats
        document.getElementById('stat-correct').textContent = correct;
        document.getElementById('stat-wrong').textContent = wrong;
        document.getElementById('stat-skipped').textContent = skipped;

        // Time
        document.getElementById('time-used-val').textContent = formatTime(timeElapsed);

        // Show all elements
        document.getElementById('score-ring-wrap').style.display = '';
        document.getElementById('stats-grid').style.display = '';
        document.getElementById('time-display').style.display = '';
        document.getElementById('btn-review').style.display = '';

        // Retry button style
        const retryBtn = document.querySelector('.btn-retry-action');
        retryBtn.classList.remove('db-retry');

    } else {
        // Database results
        document.getElementById('results-emoji').textContent = '🎓';
        document.getElementById('results-title').textContent = 'Tugatdingiz!';
        document.getElementById('results-subtitle').textContent =
            `${QUESTIONS_COUNT} ta nazariy savolni ko'rib chiqdingiz`;

        // Score ring shows 100% (completion)
        const scoreRing = document.getElementById('score-ring-fill');
        scoreRing.classList.add('db-ring');
        setTimeout(() => {
            scoreRing.style.strokeDashoffset = 0;
        }, 100);

        document.getElementById('score-percent').textContent = '✓';
        document.getElementById('score-fraction').textContent = `${QUESTIONS_COUNT} ta savol`;

        // Hide python-specific elements
        document.getElementById('stats-grid').style.display = 'none';
        document.getElementById('time-display').style.display = '';
        document.getElementById('btn-review').style.display = 'none';
        document.getElementById('time-used-val').textContent = formatTime(timeElapsed);

        // Retry button style
        const retryBtn = document.querySelector('.btn-retry-action');
        retryBtn.classList.add('db-retry');
    }
}

function toggleReview() {
    const section = document.getElementById('review-section');
    if (section.classList.contains('visible')) {
        section.classList.remove('visible');
        return;
    }

    // Generate review list
    const list = document.getElementById('review-list');
    list.innerHTML = '';

    state.answers.forEach((a, i) => {
        const item = document.createElement('div');
        item.className = 'review-item';

        let statusClass, statusIcon;
        if (a.skipped) {
            statusClass = 'r-skipped';
            statusIcon = '—';
        } else if (a.isCorrect) {
            statusClass = 'r-correct';
            statusIcon = '✓';
        } else {
            statusClass = 'r-wrong';
            statusIcon = '✗';
        }

        let answersHtml = '';
        if (a.skipped) {
            answersHtml = `
                <span class="review-tag correct-answer">To'g'ri: ${a.correct}) ${truncate(a.correctText, 30)}</span>
            `;
        } else if (a.isCorrect) {
            answersHtml = `
                <span class="review-tag your-answer is-correct">Javob: ${a.selected}) ${truncate(a.selectedText, 30)}</span>
            `;
        } else {
            answersHtml = `
                <span class="review-tag your-answer">Siz: ${a.selected}) ${truncate(a.selectedText, 25)}</span>
                <span class="review-tag correct-answer">To'g'ri: ${a.correct}) ${truncate(a.correctText, 25)}</span>
            `;
        }

        item.innerHTML = `
            <div class="review-status ${statusClass}">${statusIcon}</div>
            <div class="review-info">
                <div class="review-q">${i + 1}. ${escapeHtml(a.question)}</div>
                <div class="review-answers">${answersHtml}</div>
            </div>
        `;

        list.appendChild(item);
    });

    section.classList.add('visible');

    // Scroll to review
    setTimeout(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// --- Navigation ---
function confirmGoHome() {
    document.getElementById('modal-overlay').classList.add('visible');
    document.getElementById('confirm-modal').classList.add('visible');
}

function cancelLeave() {
    document.getElementById('modal-overlay').classList.remove('visible');
    document.getElementById('confirm-modal').classList.remove('visible');
}

function confirmLeave() {
    cancelLeave();
    cleanup();
    goHome();
}

function goHome() {
    cleanup();
    // Reset score ring
    document.getElementById('score-ring-fill').style.strokeDashoffset = SCORE_CIRCUMFERENCE;
    showScreen('home-screen');
}

function retryQuiz() {
    cleanup();
    if (state.mode) {
        startQuiz(state.mode);
    } else {
        goHome();
    }
}

function cleanup() {
    clearInterval(state.pythonTimerInterval);
    clearInterval(state.dbTimerInterval);
    clearTimeout(state.autoAdvanceTimeout);
    hideAutoAdvanceBar();
    document.getElementById('python-timer').classList.remove('urgent');
}

// ============================================
//  UTILITIES
// ============================================

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
}
