"""F1-inspired red and white design system shared by CSS and Plotly."""
import plotly.graph_objects as go
import plotly.io as pio
import streamlit as st

RED = "#E10600"
RED_DARK = "#B80500"
RED_SOFT = "#FFE5E3"
CARBON = "#15151E"
BG = "#F7F7F9"
SURFACE = "#FFFFFF"
BORDER = "#E8E8EE"
MUTED = "#6E6E7A"
GOLD, SILVER, BRONZE = "#F5B700", "#A7A9AC", "#C77B30"
TEAL = "#00A19C"

COMPOUND_COLORS = {"SOFT": "#E10600", "MEDIUM": "#FFC906", "HARD": "#E9E9EE", "INTERMEDIATE": "#39B54A",
                   "WET": "#0072C6", "UNKNOWN": "#9C9CA6"}


def register_plotly_template() -> None:
    t = go.layout.Template()
    t.layout = go.Layout(
        font=dict(family="Titillium Web, Inter, system-ui, sans-serif", color=CARBON, size=13),
        paper_bgcolor=SURFACE, plot_bgcolor=SURFACE,
        colorway=[RED, CARBON, TEAL, GOLD, "#3671C6", "#FF8000", "#27F4D2", "#229971"],
        margin=dict(l=44, r=20, t=92, b=40),
        title=dict(font=dict(size=17, color=CARBON, family="Titillium Web, sans-serif"), x=0.01, xanchor="left",
                   y=0.985, yref="container", yanchor="top"),
        xaxis=dict(gridcolor="#F0F0F4", linecolor=BORDER, zeroline=False),
        yaxis=dict(gridcolor="#F0F0F4", linecolor=BORDER, zeroline=False),
        legend=dict(orientation="h", y=1.02, yanchor="bottom", x=1, xanchor="right", bgcolor="rgba(0,0,0,0)"),
        hoverlabel=dict(bgcolor=SURFACE, bordercolor=BORDER, font=dict(color=CARBON)),
    )
    pio.templates["f1"] = t
    pio.templates.default = "plotly_white+f1"


def apply_theme() -> None:
    register_plotly_template()
    st.markdown(f"""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Titillium+Web:wght@400;600;700;900&display=swap');
    html, body, [class*="css"], .stMarkdown, .stText, button, input, select, textarea {{
        font-family: 'Titillium Web', system-ui, sans-serif !important;
    }}
    .stApp {{ background: {BG}; }}
    .block-container {{ padding-top: 3rem; max-width: 1440px; }}
    section[data-testid="stSidebar"] {{ background: {SURFACE}; border-right: 3px solid {RED}; }}
    h1, h2, h3, h4 {{ color: {CARBON}; font-weight: 700; letter-spacing: -0.01em; }}

    .f1-hero {{
        position: relative; overflow: hidden; border-radius: 16px; padding: 22px 28px; margin-bottom: 18px;
        background: linear-gradient(105deg, {RED} 0%, {RED_DARK} 55%, {CARBON} 100%); color: white;
        box-shadow: 0 12px 30px rgba(225, 6, 0, 0.22);
    }}
    .f1-hero::after {{
        content: ""; position: absolute; right: -40px; top: 0; bottom: 0; width: 260px; opacity: .18;
        background: repeating-linear-gradient(115deg, white 0 14px, transparent 14px 28px);
    }}
    .f1-hero h1 {{ color: white; margin: 0; padding: 0; font-size: 1.9rem; font-weight: 900; text-transform: uppercase;
                  letter-spacing: .02em; }}
    .f1-hero p {{ margin: 2px 0 0; opacity: .9; font-size: 1rem; }}
    .f1-hero .tag {{ display: inline-block; background: white; color: {RED}; font-weight: 700; border-radius: 4px;
                    padding: 1px 8px; font-size: .78rem; margin-bottom: 6px; letter-spacing: .06em; }}

    div[data-testid="stMetric"] {{
        background: {SURFACE}; border: 1px solid {BORDER}; border-radius: 12px; padding: 12px 16px;
        border-left: 5px solid {RED}; box-shadow: 0 2px 10px rgba(21, 21, 30, .04);
    }}
    div[data-testid="stMetric"] label {{ color: {MUTED}; text-transform: uppercase; font-size: .75rem;
                                          letter-spacing: .06em; font-weight: 600; }}
    div[data-testid="stMetricValue"] {{ font-weight: 700; }}
    div[data-testid="stMetricDelta"] svg {{ display: none; }}
    div[data-testid="stPlotlyChart"] {{ background: {SURFACE}; border: 1px solid {BORDER}; border-radius: 12px;
                                        padding: 6px; }}
    .stTabs [data-baseweb="tab-list"] {{ gap: 4px; border-bottom: 2px solid {BORDER}; }}
    .stTabs [data-baseweb="tab"] {{ font-weight: 600; padding: 8px 14px; }}
    .stTabs [aria-selected="true"] {{ color: {RED}; }}
    .stTabs [data-baseweb="tab-highlight"] {{ background: {RED}; height: 3px; }}
    .stButton > button[kind="primary"] {{ background: {RED}; border-color: {RED}; font-weight: 700; }}
    .stButton > button[kind="primary"]:hover {{ background: {RED_DARK}; border-color: {RED_DARK}; }}

    .card {{ background: {SURFACE}; border: 1px solid {BORDER}; border-radius: 12px; padding: 14px 16px; }}
    .section-title {{ display:flex; align-items:center; gap:8px; font-weight: 700; font-size: 1.05rem;
                      text-transform: uppercase; letter-spacing: .05em; margin: 4px 0 8px; color: {CARBON}; }}
    .section-title::before {{ content:""; width: 6px; height: 18px; background: {RED}; border-radius: 2px;
                              transform: skewX(-15deg); }}

    table.lb {{ width: 100%; border-collapse: separate; border-spacing: 0 4px; font-size: .92rem; }}
    table.lb th {{ text-align: left; color: {MUTED}; font-weight: 600; font-size: .72rem; text-transform: uppercase;
                   letter-spacing: .06em; padding: 0 8px; }}
    table.lb {{ border: none !important; }}
    table.lb th {{ border: none !important; background: transparent !important; }}
    table.lb td {{ background: {SURFACE}; padding: 6px 8px; border: none !important;
                   border-top: 1px solid {BORDER} !important; border-bottom: 1px solid {BORDER} !important; }}
    table.lb td:first-child {{ border-left: 1px solid {BORDER} !important; border-radius: 8px 0 0 8px; font-weight: 900;
                               width: 34px; text-align: center; }}
    table.lb td:last-child {{ border-right: 1px solid {BORDER} !important; border-radius: 0 8px 8px 0; }}
    table.lb tr.p1 td:first-child {{ background: {GOLD}; color: white; }}
    table.lb tr.p2 td:first-child {{ background: {SILVER}; color: white; }}
    table.lb tr.p3 td:first-child {{ background: {BRONZE}; color: white; }}
    table.lb tr.out td {{ opacity: .45; }}
    .teambar {{ display:inline-block; width: 4px; height: 16px; border-radius: 2px; margin-right: 8px;
                vertical-align: middle; }}
    .drv {{ font-weight: 700; letter-spacing: .03em; }}
    .tyre {{ display:inline-flex; align-items:center; justify-content:center; width: 22px; height: 22px;
             border-radius: 50%; border: 3px solid; font-size: .7rem; font-weight: 900; background: white; }}
    .pbar {{ display:inline-block; vertical-align: middle; width: 54px; margin-right: 6px; background: {RED_SOFT};
             border-radius: 4px; height: 8px; position: relative; }}
    .pbar > span {{ position:absolute; left:0; top:0; bottom:0; background: {RED}; border-radius: 4px; }}
    .muted {{ color: {MUTED}; font-size: .85rem; }}
    .chip {{ display:inline-block; padding: 2px 10px; border-radius: 999px; font-size: .78rem; font-weight: 700; }}
    .chip-red {{ background: {RED_SOFT}; color: {RED_DARK}; }}
    .chip-dark {{ background: {CARBON}; color: white; }}
    </style>
    """, unsafe_allow_html=True)


def hero(title: str, subtitle: str = "", tag: str = "") -> None:
    tag_html = f'<div class="tag">{tag}</div>' if tag else ""
    st.markdown(f'<div class="f1-hero">{tag_html}<h1>{title}</h1><p>{subtitle}</p></div>', unsafe_allow_html=True)


def section(title: str) -> None:
    st.markdown(f'<div class="section-title">{title}</div>', unsafe_allow_html=True)


def tyre_badge(compound: str) -> str:
    c = COMPOUND_COLORS.get(compound, COMPOUND_COLORS["UNKNOWN"])
    border = "#BDBDC6" if compound == "HARD" else c
    return f'<span class="tyre" style="border-color:{border};color:{CARBON}">{compound[:1]}</span>'
