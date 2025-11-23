# 🏎️ F1 Real-Time Analytics & Prediction Dashboard

A production-grade Streamlit application for real-time Formula 1 telemetry analysis, AI-driven race predictions, and historical data exploration.

![F1 Dashboard](https://img.shields.io/badge/F1-Dashboard-red)
![Python](https://img.shields.io/badge/Python-3.9-blue)
![Streamlit](https://img.shields.io/badge/Streamlit-App-FF4B4B)
![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED)

## 🚀 Features

### 1. 📡 Live Race Dashboard
- **Real-time Leaderboard**: Live standings with gap analysis and tire compound tracking.
- **Telemetry Traces**: Interactive charts comparing Speed, Throttle, and Brake inputs between drivers.
- **Session Metadata**: Track temperature, air temperature, and humidity monitoring.

### 2. 🔮 AI Predictions
- **Pit Stop Probability**: ML model predicting the likelihood of a pit stop in the next lap.
- **Tire Degradation**: Forecasts tire wear and lap time loss over a stint.
- **Race Pace Forecast**: Time-series prediction of a driver's pace for the next 5 laps.

### 3. 📜 Historical Data Archive
- **Driver Standings**: Visualize championship progression for any season (1950-Present).
- **Constructor Analysis**: Compare team performance and dominance.
- **Race Results**: Detailed breakdown of every Grand Prix in history.
- *Powered by the Jolpica API (Ergast Mirror).*

## 🛠️ Tech Stack

- **Frontend**: Streamlit, Plotly
- **Backend**: Python, Pandas, NumPy
- **Data**: FastF1, Jolpica API
- **ML**: Scikit-Learn (Logistic Regression, Linear Regression)
- **DevOps**: Docker, Docker Compose

## 📦 Installation & Usage

### Option 1: Run with Docker (Recommended)

The easiest way to run the app is using Docker.

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/gouravmurmu/f1dashboard.git
    cd f1dashboard
    ```

2.  **Run with Docker Compose**:
    ```bash
    docker-compose up --build
    ```

3.  **Access the App**:
    Open [http://localhost:8501](http://localhost:8501) in your browser.

### Option 2: Run Locally

1.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Run the App**:
    ```bash
    streamlit run app.py
    ```

## 📂 Project Structure

```
f1dashboard/
├── app.py                  # Main entry point
├── requirements.txt        # Python dependencies
├── Dockerfile              # Docker build instructions
├── docker-compose.yml      # Docker Compose configuration
├── backend/                # Data fetching & processing
│   ├── data_loader.py      # FastF1 integration
│   ├── historical_data.py  # Jolpica/Ergast API integration
│   └── feature_engineering.py
├── components/             # UI Components (Charts, Tables)
├── pages/                  # Streamlit Pages
│   ├── 1_Live_Race_Dashboard.py
│   ├── 2_Predictions.py
│   ├── 3_Insights.py
│   └── 4_Historical_Data.py
└── models/                 # ML Models
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source.
