# 💕 HeartBeat - שלח פעימות לב

## להרצה מקומית (אותה רשת WiFi)
```bash
cd couple-heartbeat
python3 server.py
```

## להעלאה לענן (בחינם) - עובד מכל מקום בעולם!

### אפשרות 1: Glitch.com (הכי קל)
1. לך ל-https://glitch.com
2. צור חשבון חינמי
3. לחץ "New Project" → "Import from GitHub"
4. או לחץ "New Project" → "glitch-hello-node"
5. מחק את כל הקבצים והעתק את הקבצים מהתיקייה הזו
6. שנה את server.js ל-server-glitch.js (או השתמש בקובץ שיצרתי)
7. הפרויקט יקבל כתובת כמו: https://your-project.glitch.me

### אפשרות 2: Render.com
1. לך ל-https://render.com
2. צור חשבון חינמי
3. לחץ "New" → "Web Service"
4. חבר ל-GitHub או העלה ידנית
5. הגדר:
   - Build Command: `npm install`
   - Start Command: `node server-node.js`
6. תקבל כתובת כמו: https://heartbeat-xxxx.onrender.com

### אפשרות 3: Railway.app
1. לך ל-https://railway.app
2. צור חשבון חינמי
3. לחץ "New Project" → "Deploy from GitHub"
4. תקבל כתובת אוטומטית

## קבצים
- `index.html` - האפליקציה עצמה
- `server.py` - שרת Python (להרצה מקומית)
- `server-node.js` - שרת Node.js (לענן)
- `package.json` - תלויות Node.js
