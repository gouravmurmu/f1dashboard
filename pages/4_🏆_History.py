from datetime import datetime

import streamlit as st

st.set_page_config(page_title="History · F1", page_icon="🏆", layout="wide")

from backend import history  # noqa: E402
from components import charts, theme  # noqa: E402
from components.session import cached_champions, cached_season_results, data_source  # noqa: E402

theme.apply_theme()
st.sidebar.markdown("### 🏆 History")
source = data_source()
this_year = datetime.now().year
year = st.sidebar.selectbox("Season", list(range(this_year, 1949, -1)), index=1 if datetime.now().month < 4 else 0)

theme.hero("History", "Every season since 1950: title fights, race-by-race results, team-mate battles and the "
           "all-time records.", tag=f"{year} SEASON")

with st.spinner(f"Loading {year} results..."):
    res, note = cached_season_results(year, source)
if note:
    st.warning(note)
if res.empty:
    st.info(f"No results for {year} yet. Pick another season in the sidebar.")
    st.stop()

races = res[~res["Sprint"]]
race_names = races.groupby("Round")["RaceName"].first()
drv = history.standings(res, "Driver")
con = history.standings(res, "Constructor")

leader, runner = drv.iloc[0], drv.iloc[1] if len(drv) > 1 else drv.iloc[0]
c = st.columns(5)
c[0].metric("Races", int(races["Round"].nunique()))
c[1].metric("Drivers' leader", drv.index[0].split()[-1], f"{leader['Points']:.0f} pts", delta_color="off",
            help=drv.index[0])
c[2].metric("Margin", f"{leader['Points'] - runner['Points']:.0f} pts", f"over {drv.index[1]}" if len(drv) > 1 else "",
            delta_color="off")
c[3].metric("Top team", con.index[0], f"{con.iloc[0]['Points']:.0f} pts", delta_color="off")
c[4].metric("Different winners", int(races[races["Position"] == 1]["DriverName"].nunique()))

tabs = st.tabs(["📈 Championship", "🏁 Race explorer", "⚔️ Head to head", "📊 Season stats", "👑 Hall of fame"])

# ---------- Championship ----------
with tabs[0]:
    mode = st.radio("Championship", ["Drivers", "Constructors"], horizontal=True)
    by = "Driver" if mode == "Drivers" else "Constructor"
    prog = history.championship_progression(res, by)
    top = st.slider("Show top", 3, min(20, prog.shape[1]), min(10, prog.shape[1]))
    st.plotly_chart(charts.progression_chart(prog, race_names, top), width="stretch")
    table = drv if by == "Driver" else con
    st.dataframe(table, width="stretch", height=420,
                 column_config={"Points": st.column_config.ProgressColumn(
                     "Points", format="%.0f", min_value=0, max_value=float(table["Points"].max()))})
    st.download_button("Download standings (CSV)", table.to_csv().encode(), f"{year}_{by.lower()}_standings.csv",
                       "text/csv")

# ---------- Race explorer ----------
with tabs[1]:
    labels = [f"R{r} · {n}" for r, n in race_names.items()]
    pick = st.selectbox("Race", labels, index=len(labels) - 1)
    rnd = race_names.index[labels.index(pick)]
    race = races[races["Round"] == rnd].sort_values("Position")
    info = race.iloc[0]
    st.markdown(f"📍 **{info['Circuit']}**, {info['Country']} · {info['Date']} · winner **{info['DriverName']}** "
                f"({info['Constructor']})")
    left, right = st.columns([2, 3], gap="large")
    with left:
        st.plotly_chart(charts.grid_vs_finish(history.position_changes(race)), width="stretch")
    with right:
        show = race[["Position", "DriverName", "Constructor", "Grid", "Laps", "Status", "Points"]].copy()
        show["Gained"] = (show["Grid"] - show["Position"]).where(show["Grid"] > 0)
        st.dataframe(show, hide_index=True, width="stretch", height=560,
                     column_config={"Gained": st.column_config.NumberColumn(format="%+d")})
        sprint = res[(res["Sprint"]) & (res["Round"] == rnd)]
        if not sprint.empty:
            with st.expander("Sprint result"):
                st.dataframe(sprint[["Position", "DriverName", "Constructor", "Grid", "Points"]], hide_index=True,
                             width="stretch")

# ---------- Head to head ----------
with tabs[2]:
    names = drv.index.tolist()
    teams = races.groupby("DriverName")["Constructor"].agg(lambda s: s.mode().iat[0])
    c1, c2 = st.columns(2)
    a = c1.selectbox("Driver A", names, index=0)
    mates = [n for n in names if teams.get(n) == teams.get(a) and n != a]
    default_b = names.index(mates[0]) if mates else min(1, len(names) - 1)
    b = c2.selectbox("Driver B", names, index=default_b, help="Defaults to the team-mate.")
    h = history.head_to_head(res, a, b)
    if h.empty:
        st.info("These drivers did not race together this season.")
    else:
        fa, fb = h[f"{a} finish"], h[f"{b} finish"]
        ga, gb = h[f"{a} grid"].replace(0, 99), h[f"{b} grid"].replace(0, 99)
        k = st.columns(4)
        k[0].metric("Race head-to-head", f"{(fa < fb).sum()} – {(fb < fa).sum()}")
        k[1].metric("Qualifying head-to-head", f"{(ga < gb).sum()} – {(gb < ga).sum()}")
        k[2].metric("Points", f"{drv.loc[a, 'Points']:.0f} – {drv.loc[b, 'Points']:.0f}")
        k[3].metric("Average finish", f"{fa.mean():.1f} – {fb.mean():.1f}")
        st.plotly_chart(charts.h2h_chart(h, a, b), width="stretch")
        with st.expander("Race by race"):
            st.dataframe(h, width="stretch")

# ---------- Season stats ----------
with tabs[3]:
    left, right = st.columns(2, gap="large")
    with left:
        wins = drv["Wins"][drv["Wins"] > 0].sort_values(ascending=False)
        st.plotly_chart(charts.bar(wins, "Wins"), width="stretch")
    with right:
        gained = races[races["Grid"] > 0].assign(G=lambda d: d["Grid"] - d["Position"]).groupby("DriverName")["G"] \
            .sum().sort_values(ascending=False).head(12)
        st.plotly_chart(charts.bar(gained, "Positions gained across the season", theme.TEAL), width="stretch")
    theme.section("Filter results")
    f1, f2, f3 = st.columns(3)
    team_f = f1.multiselect("Constructor", sorted(races["Constructor"].unique()))
    drv_f = f2.multiselect("Driver", sorted(races["DriverName"].unique()))
    only = f3.selectbox("Show", ["All results", "Wins", "Podiums", "Points finishes", "Retirements"])
    q = races.copy()
    if team_f:
        q = q[q["Constructor"].isin(team_f)]
    if drv_f:
        q = q[q["DriverName"].isin(drv_f)]
    q = {"Wins": q[q["Position"] == 1], "Podiums": q[q["Position"] <= 3], "Points finishes": q[q["Points"] > 0],
         "Retirements": q[~q["Status"].str.contains("Finished|Lap", regex=True)]}.get(only, q)
    st.dataframe(q[["Round", "RaceName", "DriverName", "Constructor", "Grid", "Position", "Points", "Status"]],
                 hide_index=True, width="stretch", height=380)
    st.download_button("Download filtered results (CSV)", q.to_csv(index=False).encode(), f"{year}_results.csv",
                       "text/csv")

# ---------- Hall of fame ----------
with tabs[4]:
    champs, cnote = cached_champions(source)
    if cnote:
        st.caption(cnote)
    left, right = st.columns([2, 3], gap="large")
    with left:
        titles = champs["Driver"].value_counts().head(12)
        st.plotly_chart(charts.bar(titles, "Most drivers' titles", height=460), width="stretch")
        teams_t = champs["Constructor"].value_counts().head(8)
        st.plotly_chart(charts.bar(teams_t, "Champion's car", theme.CARBON, height=340), width="stretch")
    with right:
        era = st.slider("Seasons", int(champs["Season"].min()), int(champs["Season"].max()),
                        (int(champs["Season"].min()), int(champs["Season"].max())))
        show = champs[champs["Season"].between(*era)]
        st.dataframe(show, hide_index=True, width="stretch", height=760,
                     column_config={"Season": st.column_config.NumberColumn(format="%d")})
