import numpy as np
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Predictions · F1", page_icon="🔮", layout="wide")

from components import charts, theme  # noqa: E402
from components.session import pit_loss, pit_model, race_picker, tyre_model  # noqa: E402
from models.pit_model import build_features  # noqa: E402
from models.strategy import optimise  # noqa: E402
from models.tyre_model import clean_laps  # noqa: E402

theme.apply_theme()
race, source = race_picker()
src = race.source if race.source == "demo" else source
theme.hero("Predictions & Strategy", "Models trained on real lap data: tyre degradation, pit stop calls, pace "
           "forecasts and an optimiser for the fastest race strategy.", tag=race.label.upper())

with st.spinner("Training models..."):
    tm = tyre_model(race.year, race.round, src)
    loss = pit_loss(race.year, race.round, src)

colors = race.team_colors
order = race.results["Driver"].tolist()
tabs = st.tabs(["🛞 Tyre degradation", "🛠️ Pit stop model", "📉 Pace forecast", "🧠 Strategy optimiser"])

# ---------- Tyre degradation ----------
with tabs[0]:
    c = st.columns(4)
    c[0].metric("Fuel effect", f"{-tm.fuel_effect:.3f} s/lap", "faster each lap as fuel burns", delta_color="off")
    c[1].metric("Pit stop loss", f"{loss:.1f} s", "measured from green-flag stops", delta_color="off")
    c[2].metric("Holdout MAE", f"{tm.metrics.get('MAE (s)', float('nan')):.3f} s")
    c[3].metric("Holdout R²", f"{tm.metrics.get('R²', float('nan')):.2f}")
    left, right = st.columns([3, 2], gap="large")
    with left:
        st.plotly_chart(charts.degradation_chart(tm, clean_laps(race.laps)), width="stretch")
    with right:
        theme.section("Compound summary")
        st.dataframe(tm.deg_table().style.format("{:.3f}"), width="stretch")
        theme.section("Raw driver pace")
        pace = pd.Series(tm.driver_pace).sort_values()
        pace = (pace - pace.min()).rename("Gap to fastest (s/lap)")
        st.dataframe(pace.to_frame().style.format("{:.3f}").bar(color="#FFB3AE"), width="stretch", height=300)
    st.caption(f"A single regression on {tm.n_laps} clean laps separates driver pace, fuel burn and compound wear. "
               "Scored on 20% of laps held out from fitting.")

# ---------- Pit stop model ----------
with tabs[1]:
    extra = st.slider("Also train on earlier races this season", 0, 5, 2,
                      help="More races give the model more stops to learn from. Live data loads each race.")
    with st.spinner("Training pit stop model..."):
        pm, used = pit_model(race.year, race.round, src, extra)
    st.markdown(f"<span class='chip chip-dark'>Trained on</span> {', '.join(used)} · {pm.n_samples:,} laps, "
                f"{pm.n_stops} stops", unsafe_allow_html=True)
    if not pm.trained:
        st.info("Too few stops to train the gradient-boosted model, so a tyre-life heuristic is used instead.")
    else:
        m = pm.metrics
        c = st.columns(4)
        c[0].metric("ROC AUC", f"{m['ROC AUC']:.3f}", f"{m['ROC AUC'] - m['Baseline ROC AUC']:+.3f} vs baseline")
        c[1].metric("PR AUC", f"{m['PR AUC']:.3f}", f"{m['PR AUC'] - m['Baseline PR AUC']:+.3f} vs baseline")
        c[2].metric("Base pit rate", f"{m['Pit rate']:.1%}")
        c[3].metric("Lift over random", f"{m['PR AUC'] / m['Pit rate']:.1f}x")
    feats = build_features(race.laps, race.total_laps)
    feats["PitProb"] = pm.predict_proba(feats)
    left, right = st.columns([3, 2], gap="large")
    with left:
        st.plotly_chart(charts.pit_probability_heatmap(feats, order), width="stretch")
    with right:
        if pm.trained:
            st.plotly_chart(charts.importance_chart(pm.importance), width="stretch")
        lap = st.slider("Who pits next? Lap", 1, race.total_laps - 1, race.total_laps // 2)
        now = feats[feats["LapNumber"] == lap][["Driver", "Compound", "TyreLife", "PitProb"]]
        st.dataframe(now.sort_values("PitProb", ascending=False).head(8).style.format(
            {"PitProb": "{:.0%}", "TyreLife": "{:.0f}"}).bar(subset=["PitProb"], color="#FFB3AE", vmin=0, vmax=1),
            hide_index=True, width="stretch")
    st.caption("Gradient-boosted trees on tyre age, compound, stint, race progress, laps remaining, pace drop-off, "
               "safety car and position. Metrics are out-of-fold: each fold holds out whole drivers. The baseline "
               "is a logistic regression on tyre age alone.")

# ---------- Pace forecast ----------
with tabs[2]:
    c1, c2, c3 = st.columns([1, 2, 1])
    driver = c1.selectbox("Driver", order)
    dl = race.laps[race.laps["Driver"] == driver]
    max_lap = int(dl["LapNumber"].max())
    from_lap = c2.slider("Forecast from lap", 2, max(3, max_lap - 1), max(2, min(max_lap - 1, race.total_laps // 3)))
    horizon = c3.slider("Laps ahead", 3, 20, 10)
    cur = dl[dl["LapNumber"] == from_lap].iloc[0]
    future = np.arange(from_lap + 1, min(race.total_laps, from_lap + horizon) + 1)
    life = cur["TyreLife"] + (future - from_lap)
    pred = tm.predict(driver, cur["Compound"], life, future)
    band = 1.645 * tm.sigma
    fc = pd.DataFrame({"LapNumber": future, "Pred": pred, "Lower": pred - band, "Upper": pred + band})
    hist = dl[(dl["LapNumber"] <= future.max()) & (dl["LapNumber"] > 1)]
    hist = hist[hist["LapTime"] < hist["LapTime"].median() * 1.08]
    st.plotly_chart(charts.pace_forecast_chart(hist, fc, driver, colors.get(driver, theme.RED)), width="stretch")
    actual = dl.set_index("LapNumber")["LapTime"].reindex(future)
    ok = actual.notna().values & (actual.values < np.nanmedian(dl["LapTime"]) * 1.08)
    if ok.any():
        err = np.abs(actual.values[ok] - pred[ok]).mean()
        st.markdown(f"Forecast on **{cur['Compound'].title()}** tyres aged {int(cur['TyreLife'])} laps. "
                    f"Mean error against what actually happened: **{err:.2f}s** per lap "
                    f"(pit and safety car laps excluded).")

# ---------- Strategy optimiser ----------
with tabs[3]:
    c1, c2 = st.columns(2)
    pl = c1.slider("Pit stop loss (s)", 15.0, 35.0, float(round(loss, 1)), 0.5)
    min_stint = c2.slider("Shortest stint (laps)", 4, 15, 8)
    with st.spinner("Evaluating every one- and two-stop plan..."):
        plans = optimise(tm, race.total_laps, pl, min_stint=min_stint)
    if plans.empty:
        st.info("No valid strategies for these settings.")
    else:
        best = plans.iloc[0]
        st.markdown(f"Fastest plan: <span class='chip chip-red'>{best['Plan']}</span> stopping on lap "
                    f"**{best['Pit laps']}**. Plans use compound degradation fitted on this race.",
                    unsafe_allow_html=True)
        st.plotly_chart(charts.strategy_chart(plans, race.total_laps), width="stretch")
        actual = (race.laps.groupby("Driver")["PitIn"].sum().value_counts().sort_index()
                  .rename(lambda k: f"{k}-stop").rename("Drivers"))
        st.markdown("What teams actually did: " + ", ".join(f"**{v}** × {k}" for k, v in actual.items()))
