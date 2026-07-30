var heroEl = document.getElementById("hero");
var savedEl = document.getElementById("saved");
var zipInput = document.getElementById("zip");
var searchBtn = document.getElementById("search");
var errorEl = document.getElementById("error");

var defaultLat = "37.7849";
var defaultLon = "-122.4094";
var defaultCity = "San Francisco";
var currentLat = defaultLat;
var currentLon = defaultLon;

var icons = {
  Sunny: "\u2600\uFE0F",
  Clear: "\u2600\uFE0F",
  "Mostly Sunny": "\uD83C\uDF24\uFE0F",
  "Mostly Clear": "\uD83C\uDF19",
  "Partly Sunny": "\u26C5",
  "Partly Cloudy": "\u26C5",
  "Mostly Cloudy": "\uD83C\uDF25\uFE0F",
  Cloudy: "\u2601\uFE0F",
  "Slight Chance Rain Showers": "\uD83C\uDF26\uFE0F",
  "Chance Rain Showers": "\uD83C\uDF26\uFE0F",
  "Rain Showers Likely": "\uD83C\uDF27\uFE0F",
  Rain: "\uD83C\uDF27\uFE0F",
  "Light Rain": "\uD83C\uDF27\uFE0F",
  "Heavy Rain": "\uD83C\uDF27\uFE0F",
  Showers: "\uD83C\uDF27\uFE0F",
  Thunderstorms: "\u26C8\uFE0F",
  Snow: "\uD83C\uDF28\uFE0F",
  "Light Snow": "\uD83C\uDF28\uFE0F",
  "Heavy Snow": "\uD83C\uDF28\uFE0F",
  Fog: "\uD83C\uDF2B\uFE0F",
  Windy: "\uD83D\uDCA8",
};

// longest key first so "Mostly Sunny" doesn't match plain "Sunny"
var iconKeys = Object.keys(icons).sort(function (a, b) {
  return b.length - a.length;
});

// "Clear" and "Sunny" share one entry in `icons`, and at night the sun is the
// wrong half of it — swap in the lunar equivalent after the label match.
var nightIcons = {
  "\u2600\uFE0F": "\uD83C\uDF19",
  "\uD83C\uDF24\uFE0F": "\uD83C\uDF19",
  "\u26C5": "\u2601\uFE0F",
};

function icon(forecast, daytime) {
  for (var ki = 0; ki < iconKeys.length; ki++) {
    if (forecast.indexOf(iconKeys[ki]) === -1) continue;
    var g = icons[iconKeys[ki]];
    return !daytime && nightIcons[g] ? nightIcons[g] : g;
  }
  return daytime ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

var stateAbbrs = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
  "District of Columbia": "DC", "Puerto Rico": "PR",
};

function cToF(c) {
  return Math.round((c * 9) / 5 + 32);
}

function fmtHour(iso, timeZone) {
  var d = new Date(iso);
  var h;
  if (timeZone) {
    // hour at the forecast location, not the viewer's local time
    h = parseInt(
      d.toLocaleString("en-US", { timeZone: timeZone, hour: "numeric", hour12: false }),
      10,
    ) % 24;
  } else {
    h = d.getHours();
  }
  if (h === 0) return "12AM";
  if (h < 12) return h + "AM";
  if (h === 12) return "12PM";
  return h - 12 + "PM";
}

function fmtTime(date) {
  var h = date.getHours();
  var m = date.getMinutes();
  var ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return h + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
}

function fmtTimeInTz(date, timeZone) {
  if (!timeZone) return fmtTime(date);
  var parts = date.toLocaleString("en-US", {
    timeZone: timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return parts;
}

function getTzOffset(timeZone, date) {
  var utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  var loc = new Date(date.toLocaleString("en-US", { timeZone: timeZone }));
  return (loc - utc) / 60000;
}

function calcSunTimes(lat, lon, date, timeZone) {
  var rad = Math.PI / 180;
  var JD = Math.floor(date.getTime() / 86400000) + 2440587.5;
  var n = JD - 2451545.0;
  var L = (280.46 + 0.9856474 * n) % 360;
  var g = ((357.528 + 0.9856003 * n) % 360) * rad;
  var lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  var eps = 23.439 * rad - 0.0000004 * rad * n;
  var sinDec = Math.sin(eps) * Math.sin(lambda);
  var decl = Math.asin(sinDec);
  var cosHA =
    (Math.cos(90.833 * rad) - Math.sin(lat * rad) * sinDec) /
    (Math.cos(lat * rad) * Math.cos(decl));
  if (cosHA > 1 || cosHA < -1)
    return {
      sunrise: new Date(date),
      sunset: new Date(date),
      solarNoon: new Date(date),
      declination: 0,
      dayLength: 0,
    };
  var HA = Math.acos(cosHA) / rad;
  var y = Math.tan(eps / 2);
  y = y * y;
  var Lrad = L * rad;
  var eqTime =
    (4 *
      (y * Math.sin(2 * Lrad) -
        2 * 0.01671 * Math.sin(g) +
        4 * 0.01671 * y * Math.sin(g) * Math.cos(2 * Lrad))) /
    rad;
  var solarNoon = 720 - 4 * lon - eqTime;
  var tzOff = timeZone ? getTzOffset(timeZone, date) : -date.getTimezoneOffset();
  var riseLocalMin = solarNoon - 4 * HA + tzOff;
  var setLocalMin = solarNoon + 4 * HA + tzOff;
  var noonLocalMin = solarNoon + tzOff;
  function minsToDate(mins) {
    var d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCMinutes(Math.round(mins));
    return d;
  }
  return {
    sunrise: minsToDate(solarNoon - 4 * HA),
    sunset: minsToDate(solarNoon + 4 * HA),
    solarNoon: minsToDate(solarNoon),
    declination: decl / rad,
    dayLength: 8 * HA,
    riseLocalMin: riseLocalMin,
    setLocalMin: setLocalMin,
    noonLocalMin: noonLocalMin,
  };
}

// Maps a weather.gov shortForecast onto one of the gradient card's backdrops.
function conditionClass(forecast, isDaytime) {
  var f = forecast.toLowerCase();
  if (!isDaytime) return "night";
  if (f.indexOf("rain") !== -1 || f.indexOf("shower") !== -1 || f.indexOf("thunder") !== -1) {
    return "rain";
  }
  if (f.indexOf("snow") !== -1 || f.indexOf("sleet") !== -1 || f.indexOf("ice") !== -1) {
    // pale gradient; white text would wash out
    return "snow on-light";
  }
  if (f.indexOf("cloud") !== -1 || f.indexOf("overcast") !== -1 || f.indexOf("fog") !== -1) {
    return "cloudy";
  }
  return "clear-day";
}

function dirToDeg(dir) {
  var dirs = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5,
  };
  return dirs[dir] !== undefined ? dirs[dir] : 0;
}

function windCompassSvg(dir, speed) {
  var deg = dirToDeg(dir);
  var cx = 60;
  var cy = 60;
  var r = 35;
  var svg = '<svg viewBox="0 0 120 120" class="wind-compass">';
  svg +=
    '<circle cx="' +
    cx +
    '" cy="' +
    cy +
    '" r="' +
    r +
    '" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>';
  svg +=
    '<circle cx="' +
    cx +
    '" cy="' +
    cy +
    '" r="18" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
  for (var ti = 0; ti < 360; ti += 6) {
    var tRad = ((ti - 90) * Math.PI) / 180;
    var isC = ti % 90 === 0;
    var isM = ti % 30 === 0;
    var inner = isC ? r - 7 : isM ? r - 4 : r - 2;
    svg +=
      '<line x1="' +
      (cx + inner * Math.cos(tRad)).toFixed(1) +
      '" y1="' +
      (cy + inner * Math.sin(tRad)).toFixed(1) +
      '" x2="' +
      (cx + r * Math.cos(tRad)).toFixed(1) +
      '" y2="' +
      (cy + r * Math.sin(tRad)).toFixed(1) +
      '" stroke="' +
      (isC ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)") +
      '" stroke-width="' +
      (isC ? "1.5" : "0.8") +
      '"/>';
  }
  svg +=
    '<text x="' +
    cx +
    '" y="' +
    (cy - r - 5) +
    '" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">N</text>';
  svg +=
    '<text x="' +
    (cx + r + 8) +
    '" y="' +
    (cy + 4) +
    '" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="10" font-weight="600">E</text>';
  svg +=
    '<text x="' +
    cx +
    '" y="' +
    (cy + r + 12) +
    '" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="10" font-weight="600">S</text>';
  svg +=
    '<text x="' +
    (cx - r - 8) +
    '" y="' +
    (cy + 4) +
    '" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="10" font-weight="600">W</text>';
  // weather.gov gives ranges ("0 to 5 mph"); parseInt returns a falsy 0 there,
  // so pull every number out and render them compactly inside the dial
  var spdNums = String(speed).match(/\d+/g);
  var spdNum = spdNums ? spdNums.join("–") : speed;
  svg +=
    '<text x="' +
    cx +
    '" y="' +
    (cy - 1) +
    '" text-anchor="middle" fill="#fff" font-size="18" font-weight="300">' +
    spdNum +
    "</text>";
  svg +=
    '<text x="' +
    cx +
    '" y="' +
    (cy + 10) +
    '" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="8">mph</text>';
  var aRad = ((deg - 90) * Math.PI) / 180;
  var tipX = cx + (r - 2) * Math.cos(aRad);
  var tipY = cy + (r - 2) * Math.sin(aRad);
  var hLen = 9;
  var hAng = 0.3;
  svg +=
    '<polygon points="' +
    tipX.toFixed(1) +
    "," +
    tipY.toFixed(1) +
    " " +
    (tipX - hLen * Math.cos(aRad - hAng)).toFixed(1) +
    "," +
    (tipY - hLen * Math.sin(aRad - hAng)).toFixed(1) +
    " " +
    (tipX - hLen * Math.cos(aRad + hAng)).toFixed(1) +
    "," +
    (tipY - hLen * Math.sin(aRad + hAng)).toFixed(1) +
    '" fill="#fff"/>';
  var tailR = 16;
  var tailX = cx - tailR * Math.cos(aRad);
  var tailY = cy - tailR * Math.sin(aRad);
  svg +=
    '<line x1="' +
    cx +
    '" y1="' +
    cy +
    '" x2="' +
    tailX.toFixed(1) +
    '" y2="' +
    tailY.toFixed(1) +
    '" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-linecap="round"/>';
  svg +=
    '<circle cx="' +
    tailX.toFixed(1) +
    '" cy="' +
    tailY.toFixed(1) +
    '" r="3.5" fill="rgba(255,255,255,0.6)"/>';
  svg += "</svg>";
  return svg;
}

// ── UV, air quality and pressure (Open-Meteo) ──
// weather.gov publishes neither a UV index nor air quality, so those tiles come
// from Open-Meteo: free, keyless, CORS-open, and global — it takes the same
// lat/lon the city search already resolved, so every place the app can find
// gets the full tile set.

function uvLabel(uv) {
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very High";
  return "Extreme";
}

function uvAdvice(uv) {
  if (uv < 3) return "No sun protection needed.";
  if (uv < 6) return "Sunscreen and a hat recommended.";
  if (uv < 8) return "Limit midday sun; sunscreen essential.";
  return "Avoid midday sun if you can.";
}

function dewComfort(dewF) {
  if (dewF < 40) return "very dry air";
  if (dewF < 55) return "dry, comfortable air";
  if (dewF < 65) return "slightly humid air";
  return "muggy air";
}

// US EPA AQI breakpoints, collapsed onto the 5 labels the tile shows
function aqiCategory(aqi) {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Fair";
  if (aqi <= 150) return "Moderate";
  if (aqi <= 200) return "Poor";
  return "Very Poor";
}

function aqiMeaning(cat) {
  if (cat === "Good") return "Air quality is satisfactory for everyone.";
  if (cat === "Fair") return "Acceptable; unusually sensitive people may want to limit long outdoor exertion.";
  if (cat === "Moderate") return "Sensitive groups should reduce prolonged or heavy outdoor exertion.";
  if (cat === "Poor") return "Everyone may begin to experience health effects.";
  return "Health warnings of emergency conditions.";
}

function jsonOrNull(url) {
  return fetch(url)
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .catch(function () {
      return null;
    });
}

// Two independent upstreams: one being down must not blank the other's tile,
// so each resolves to null on its own rather than rejecting the pair.
function fetchExtras(lat, lon) {
  var fc =
    "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&current=uv_index,pressure_msl,surface_pressure&daily=uv_index_max" +
    "&hourly=uv_index,pressure_msl" +
    "&timezone=auto&forecast_days=1";
  var air =
    "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + lat +
    "&longitude=" + lon + "&current=us_aqi,pm2_5";

  return Promise.all([jsonOrNull(fc), jsonOrNull(air)]).then(function (r) {
    var f = r[0];
    var a = r[1];
    var out = {
      uv: null,
      uvMax: null,
      uvHourly: null,
      pressureHpa: null,
      stationHpa: null,
      pressureTrend: null,
      aqi: null,
      pm25: null,
    };
    if (f && f.current) {
      out.uv = f.current.uv_index != null ? f.current.uv_index : null;
      // pressure_msl, not surface_pressure: station pressure falls with
      // elevation (Bend at 3,600 ft reads ~26 inHg), so only the sea-level
      // reduction is comparable between cities or against a fixed dial
      out.pressureHpa = f.current.pressure_msl != null ? f.current.pressure_msl : null;
      out.stationHpa =
        f.current.surface_pressure != null ? f.current.surface_pressure : null;
    }
    if (f && f.daily && f.daily.uv_index_max) out.uvMax = f.daily.uv_index_max[0];
    if (f && f.hourly && f.hourly.time) {
      var t = f.hourly.time;
      var uv = f.hourly.uv_index;
      if (uv && uv.length === t.length) {
        out.uvHourly = [];
        for (var i = 0; i < t.length; i++) out.uvHourly.push({ time: t[i], uv: uv[i] });
      }
      var sp = f.hourly.pressure_msl;
      if (sp && out.pressureHpa !== null) {
        // hourly[] is today 00:00–23:00 in the location's own time; the model's
        // value 3 h back is the trend baseline. Before 03:00 there's no baseline
        // inside today, so the tile just omits the trend.
        var hr = parseInt((f.current && f.current.time ? f.current.time : t[0]).slice(11, 13), 10);
        if (hr >= 3 && sp[hr - 3] != null) out.pressureTrend = out.pressureHpa - sp[hr - 3];
      }
    }
    if (a && a.current) {
      out.aqi = a.current.us_aqi != null ? a.current.us_aqi : null;
      out.pm25 = a.current.pm2_5 != null ? a.current.pm2_5 : null;
    }
    return out;
  });
}

// ── Small visualizations for the new tiles ──

function scaleBarHtml(pct, gradient) {
  var p = Math.max(0, Math.min(100, pct));
  return (
    '<div class="scale-bar" style="background:' + gradient + '">' +
    '<div class="scale-knob" style="left:calc(' + p.toFixed(1) + '% - 7px)"></div>' +
    "</div>"
  );
}

function detailRow(k, v) {
  return (
    '<div class="detail-row"><span class="detail-k">' + k +
    '</span><span class="detail-v">' + v + "</span></div>"
  );
}

// Today's UV bell curve: gradient fill under a dashed outline, threshold
// gridlines, and a marker at the location's current hour.
function uvCurveSvg(hourly, timeZone, nowTime) {
  var W = 280;
  var H = 90;
  var maxUv = 11;
  for (var i = 0; i < hourly.length; i++) if (hourly[i].uv > maxUv) maxUv = hourly[i].uv;
  var x = function (i) {
    return (i / (hourly.length - 1)) * W;
  };
  var y = function (uv) {
    return H - (uv / maxUv) * H;
  };

  var line = "";
  for (var j = 0; j < hourly.length; j++) {
    line += (j ? "L" : "M") + x(j).toFixed(1) + "," + y(hourly[j].uv).toFixed(1) + " ";
  }
  var area = line + "L" + W + "," + H + " L0," + H + " Z";

  var tzOff = timeZone ? getTzOffset(timeZone, nowTime) : -nowTime.getTimezoneOffset();
  var nowMin = nowTime.getUTCHours() * 60 + nowTime.getUTCMinutes() + tzOff;
  var nowFrac = Math.max(0, Math.min(1, nowMin / 1440));
  var nowX = nowFrac * W;
  var fi = Math.min(hourly.length - 2, Math.floor(nowFrac * (hourly.length - 1)));
  var ft = nowFrac * (hourly.length - 1) - fi;
  var nowUv = hourly[fi].uv + (hourly[fi + 1].uv - hourly[fi].uv) * ft;

  var bands = [[3, "Mod"], [6, "High"], [8, "V High"], [11, "Extreme"]];
  var svg =
    '<svg viewBox="0 0 ' + W + " " + (H + 14) + '" class="uv-curve">' +
    '<defs><linearGradient id="uvFill" x1="0" y1="1" x2="0" y2="0">' +
    '<stop offset="0%" stop-color="#4ade80"/><stop offset="35%" stop-color="#facc15"/>' +
    '<stop offset="65%" stop-color="#fb923c"/><stop offset="100%" stop-color="#e879f9"/>' +
    "</linearGradient></defs>";
  for (var b = 0; b < bands.length; b++) {
    if (bands[b][0] > maxUv) continue;
    var by = y(bands[b][0]).toFixed(1);
    svg +=
      '<line x1="0" x2="' + W + '" y1="' + by + '" y2="' + by +
      '" stroke="currentColor" stroke-opacity="0.18"/>' +
      '<text x="2" y="' + (by - 2) + '" font-size="7" fill="currentColor" fill-opacity="0.6">' +
      bands[b][1] + "</text>";
  }
  svg +=
    '<path d="' + area + '" fill="url(#uvFill)" fill-opacity="0.35"/>' +
    '<path d="' + line + '" fill="none" stroke="url(#uvFill)" stroke-width="2" stroke-dasharray="4 3"/>' +
    '<line x1="' + nowX.toFixed(1) + '" x2="' + nowX.toFixed(1) + '" y1="0" y2="' + H +
    '" stroke="currentColor" stroke-opacity="0.6"/>' +
    '<circle cx="' + nowX.toFixed(1) + '" cy="' + y(nowUv).toFixed(1) +
    '" r="4" fill="currentColor"/>';
  var labels = ["12 AM", "6 AM", "12 PM", "6 PM"];
  for (var l = 0; l < labels.length; l++) {
    svg +=
      '<text x="' + ((l / 4) * W + 2) + '" y="' + (H + 11) +
      '" font-size="8" fill="currentColor" fill-opacity="0.6">' + labels[l] + "</text>";
  }
  return svg + "</svg>";
}

// Semicircular dial over the range sea-level pressure actually spans (29–31 inHg)
function pressureGaugeSvg(inHg) {
  var W = 130;
  var H = 78;
  var c = W / 2;
  var cy = H - 10;
  var r = 52;
  var frac = Math.max(0, Math.min(1, (inHg - 29) / 2));
  var rad = ((180 + frac * 180) * Math.PI) / 180;
  var nx = c + (r - 8) * Math.cos(rad);
  var ny = cy + (r - 8) * Math.sin(rad);
  return (
    '<svg viewBox="0 0 ' + W + " " + H + '" class="pressure-gauge">' +
    '<path d="M ' + (c - r) + " " + cy + " A " + r + " " + r + " 0 0 1 " + (c + r) + " " + cy +
    '" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="6" stroke-linecap="round"/>' +
    '<line x1="' + c + '" y1="' + cy + '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) +
    '" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
    '<circle cx="' + c + '" cy="' + cy + '" r="3.5" fill="currentColor"/>' +
    '<text x="' + (c - r + 2) + '" y="' + (cy + 12) +
    '" font-size="8" fill="currentColor" fill-opacity="0.65">Low</text>' +
    '<text x="' + (c + r - 2) + '" y="' + (cy + 12) +
    '" font-size="8" text-anchor="end" fill="currentColor" fill-opacity="0.65">High</text>' +
    "</svg>"
  );
}

// ── Moon phase ──
// Mean synodic month from a known new moon. Good to a few hours, which is well
// inside the resolution of a phase name and an illumination percentage.
function moonPhase(date) {
  var SYNODIC = 29.530588853;
  var refNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  var days = (date.getTime() - refNewMoon) / 86400000;
  var frac = (((days % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC;
  var illum = Math.round(((1 - Math.cos(2 * Math.PI * frac)) / 2) * 100);
  var names = [
    "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
    "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
  ];
  // the four exact phases get a narrow window; the quarters fill the gaps
  var idx = Math.floor(frac * 8 + 0.5) % 8;
  return {
    fraction: frac,
    illuminationPct: illum,
    name: names[idx],
    daysToFull: Math.round(((0.5 - frac + 1) % 1) * SYNODIC),
    daysToNew: Math.round(((1 - frac) % 1) * SYNODIC),
  };
}

var moonUid = 0;

// Textured, shaded moon: fractal-noise bump map for the surface, an elliptical
// terminator for the phase, and a halo that scales with illumination. No image
// asset — the whole disc is generated.
function moonDiscSvg(frac, cls) {
  var c = 50;
  var r = 40;
  var p = ((frac % 1) + 1) % 1;
  var k = Math.cos(2 * Math.PI * p);
  var rx = Math.abs(k) * r;
  var illum = (1 - k) / 2;
  // lit and unlit regions share the terminator arc, so together they tile the
  // disc exactly; only the limb semicircle differs between waxing and waning
  var termSweep = p <= 0.5 ? (k > 0 ? 0 : 1) : k > 0 ? 1 : 0;
  var limbSweep = p <= 0.5 ? 0 : 1;
  var unlit =
    "M " + c + " " + (c - r) + " A " + r + " " + r + " 0 0 " + limbSweep + " " + c + " " + (c + r) +
    " A " + rx.toFixed(2) + " " + r + " 0 0 " + termSweep + " " + c + " " + (c - r) + " Z";

  // filter/gradient ids are document-global: two moons on one page (tile and
  // popover) must not share them or the second overwrites the first
  var u = "mn" + ++moonUid;
  var craters = [
    [38, 32, 13, 0.16], [58, 44, 10, 0.13], [44, 58, 8, 0.12], [63, 64, 6, 0.1],
    [30, 52, 3.5, 0.22], [52, 26, 2.5, 0.2], [68, 32, 3, 0.18], [40, 72, 2.5, 0.22],
    [57, 75, 2, 0.18], [25, 38, 2, 0.2], [72, 52, 2, 0.16],
  ];
  var svg =
    '<svg viewBox="0 0 100 100" class="' + cls + '"><defs>' +
    '<filter id="' + u + 'tex" x="-10%" y="-10%" width="120%" height="120%">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.14" numOctaves="5" seed="3" result="noise"/>' +
    '<feDiffuseLighting in="noise" lighting-color="#e8e5d7" surfaceScale="1.5" result="lit">' +
    '<feDistantLight azimuth="' + (p <= 0.5 ? 0 : 180) + '" elevation="62"/>' +
    "</feDiffuseLighting>" +
    '<feComposite in="lit" in2="SourceGraphic" operator="in"/></filter>' +
    '<radialGradient id="' + u + 'limb" cx="42%" cy="38%" r="68%">' +
    '<stop offset="0%" stop-color="#fff" stop-opacity="0.18"/>' +
    '<stop offset="55%" stop-color="#000" stop-opacity="0"/>' +
    '<stop offset="100%" stop-color="#1c1a10" stop-opacity="0.5"/></radialGradient>' +
    '<filter id="' + u + 'blurT" x="-20%" y="-20%" width="140%" height="140%">' +
    '<feGaussianBlur stdDeviation="1.6"/></filter>' +
    '<filter id="' + u + 'blurG" x="-50%" y="-50%" width="200%" height="200%">' +
    '<feGaussianBlur stdDeviation="4"/></filter>' +
    '<clipPath id="' + u + 'disc"><circle cx="50" cy="50" r="40"/></clipPath></defs>' +
    '<circle cx="50" cy="50" r="40" fill="#fff" opacity="' + (0.12 + 0.35 * illum).toFixed(2) +
    '" filter="url(#' + u + 'blurG)"/>' +
    '<circle cx="50" cy="50" r="40" fill="#c9c6b8" filter="url(#' + u + 'tex)"/><g fill="#55543f">';
  for (var i = 0; i < craters.length; i++) {
    svg +=
      '<circle cx="' + craters[i][0] + '" cy="' + craters[i][1] + '" r="' + craters[i][2] +
      '" opacity="' + craters[i][3] + '"/>';
  }
  return (
    svg + "</g>" +
    '<circle cx="50" cy="50" r="40" fill="url(#' + u + 'limb)"/>' +
    '<g clip-path="url(#' + u + 'disc)"><path d="' + unlit +
    '" fill="#0e1626" fill-opacity="0.85" filter="url(#' + u + 'blurT)"/></g>' +
    '<circle cx="50" cy="50" r="40" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="0.8"/>' +
    "</svg>"
  );
}

function showError(msg) {
  heroEl.innerHTML = "";
  errorEl.innerHTML = '<div class="error-msg">' + msg + "</div>";
}

function fetchWeather(lat, lon, city, saveLoc) {
  currentLat = lat;
  currentLon = lon;
  heroEl.innerHTML = '<div class="loading">Loading\u2026</div>';
  errorEl.textContent = "";
  searchBtn.disabled = true;

  var gridUrl = "";
  var locationTz = "";
  loadExtras(lat, lon);

  fetch("https://api.weather.gov/points/" + lat + "," + lon)
    .then(function (res) {
      if (!res.ok) throw new Error("Location not found");
      return res.json();
    })
    .then(function (points) {
      var p = points.properties;
      locationTz = p.timeZone || "";
      if (!city) {
        var rl = p.relativeLocation.properties;
        city = rl.city + ", " + rl.state;
      }
      if (saveLoc) saveRecent(city, lat, lon);
      gridUrl = "https://api.weather.gov/gridpoints/" + p.gridId + "/" + p.gridX + "," + p.gridY;
      return Promise.all([
        fetch(p.forecast).then(function (r) {
          return r.json();
        }),
        fetch(p.forecast + "/hourly").then(function (r) {
          return r.json();
        }),
        fetch(gridUrl).then(function (r) {
          return r.ok ? r.json() : null;
        }),
      ]);
    })
    .then(function (results) {
      searchBtn.disabled = false;
      render(city, results[0], results[1], results[2], locationTz);
    })
    .catch(function () {
      searchBtn.disabled = false;
      showError("Could not load weather data");
    });
}

function geocodeAndFetch(query) {
  errorEl.textContent = "";
  heroEl.innerHTML = '<div class="loading">Looking up location\u2026</div>';
  searchBtn.disabled = true;

  var isZip = /^\d{5}$/.test(query.trim());

  // Non-ZIP text resolves against our own index first, so pressing Enter lands
  // on the same place the typeahead would have offered.
  if (!isZip) {
    fetch("api/cities?q=" + encodeURIComponent(query))
      .then(function (r) {
        return r.json();
      })
      .then(function (rows) {
        if (!rows || !rows.length) throw new Error("no local match");
        var top = rows[0];
        var label = top.state ? top.name + ", " + top.state : top.name;
        history.replaceState(null, "", "?q=" + encodeURIComponent(query));
        fetchWeather(String(top.lat), String(top.lon), label, true);
      })
      .catch(function () {
        searchBtn.disabled = false;
        showError('Could not find "' + esc(query) + '". Try a city name or US ZIP code.');
      });
    return;
  }

  var url = isZip
    ? "https://nominatim.openstreetmap.org/search?postalcode=" +
      encodeURIComponent(query) +
      "&country=US&format=json&limit=1&addressdetails=1"
    : "https://nominatim.openstreetmap.org/search?q=" +
      encodeURIComponent(query) +
      "&countrycodes=us&format=json&limit=1&addressdetails=1";

  fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error("fail");
      return res.json();
    })
    .then(function (results) {
      if (!results || results.length === 0) throw new Error("No match");
      var r = results[0];
      var ad = r.address || {};
      var cityName = ad.city || ad.town || ad.village || r.display_name.split(",")[0].trim();
      var state = ad.state || "";
      var stateAbbr = stateAbbrs[state] || state;
      var label = stateAbbr ? cityName + ", " + stateAbbr : cityName;
      history.replaceState(null, "", "?q=" + encodeURIComponent(query));
      fetchWeather(r.lat, r.lon, label, true);
    })
    .catch(function () {
      searchBtn.disabled = false;
      showError('Could not find "' + esc(query) + '". Try a city name or US ZIP code.');
    });
}

function getGridVal(grid, field) {
  if (!grid || !grid.properties || !grid.properties[field]) return null;
  var v = grid.properties[field].values;
  if (!v || v.length === 0) return null;
  var now = new Date();
  for (var i = 0; i < v.length; i++) {
    var parts = v[i].validTime.split("/");
    var start = new Date(parts[0]);
    if (start > now) return i > 0 ? v[i - 1].value : v[0].value;
  }
  return v[v.length - 1].value;
}

// `detail` rides along in a <template>: inert until a tap clones it into the
// popover, so the richer visualization costs nothing until it's asked for.
function tile(label, value, sub, extra, detail) {
  return (
    '<div class="tile' + (detail ? " tappable" : "") + '"' +
    (detail ? ' tabindex="0" role="button"' : "") + ">" +
    '<div class="tile-label">' + label + "</div>" +
    '<div class="tile-value">' + value + "</div>" +
    (extra || "") +
    (sub ? '<div class="tile-sub">' + sub + "</div>" : "") +
    (detail ? '<template class="tile-detail">' + detail + "</template>" : "") +
    "</div>"
  );
}

function skeletonTile() {
  return (
    '<div class="tile tile-skeleton">' +
    '<div class="sk-line sk-label"></div>' +
    '<div class="sk-line sk-value"></div>' +
    '<div class="sk-line sk-sub"></div>' +
    "</div>"
  );
}

// ── Tile popover ──
// Tapping a tile opens the same tile enlarged over a scrim, rather than
// expanding in place — the grid must not reflow under your finger.

var popEl = null;

function closePopover() {
  if (!popEl) return;
  popEl.remove();
  popEl = null;
}

function openPopover(tileEl) {
  var tpl = tileEl.querySelector(".tile-detail");
  if (!tpl) return;
  closePopover();
  var card = heroEl.querySelector(".wx-card");
  var cond = card ? card.className.replace("wx-card", "").trim() : "";
  var label = tileEl.querySelector(".tile-label");
  var value = tileEl.querySelector(".tile-value");
  var sub = tileEl.querySelector(".tile-sub");

  popEl = document.createElement("div");
  popEl.className = "wx-pop-overlay";
  popEl.innerHTML =
    '<div class="wx-pop wx-card ' + cond + '">' +
    '<button class="wx-pop-close" aria-label="Close">✕</button>' +
    '<div class="tile-label">' + (label ? label.innerHTML : "") + "</div>" +
    '<div class="wx-pop-value">' + (value ? value.innerHTML : "") + "</div>" +
    (sub ? '<div class="tile-sub">' + sub.innerHTML + "</div>" : "") +
    '<div class="wx-pop-body">' + tpl.innerHTML + "</div>" +
    "</div>";
  popEl.addEventListener("click", function (e) {
    if (!e.target.closest(".wx-pop") || e.target.closest(".wx-pop-close")) closePopover();
  });
  document.body.appendChild(popEl);
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closePopover();
});

// delegated so it survives every re-render of the card
document.addEventListener("click", function (e) {
  var t = e.target.closest(".tile.tappable");
  if (t && !popEl) openPopover(t);
});

document.addEventListener("keydown", function (e) {
  if (e.key !== "Enter" && e.key !== " ") return;
  var t = document.activeElement;
  if (t && t.classList && t.classList.contains("tappable")) {
    e.preventDefault();
    openPopover(t);
  }
});

// ── Extras (UV / air quality / pressure) ──
// These land on their own clock: the card renders the moment weather.gov
// answers, and these tiles swap in over skeletons when Open-Meteo does. The
// sequence number drops a reply for a city you've already navigated away from.

var extrasSeq = 0;
var extrasData = null;
var extrasTz = "";

function loadExtras(lat, lon) {
  var seq = ++extrasSeq;
  extrasData = null;
  fetchExtras(lat, lon).then(function (e) {
    if (seq !== extrasSeq) return;
    extrasData = e;
    renderExtras();
  });
}

function fmtLocalHour(iso) {
  var h = parseInt(iso.slice(11, 13), 10);
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? h + " AM" : h - 12 + " PM";
}

function extrasHtml() {
  var e = extrasData;
  if (!e) return skeletonTile() + skeletonTile() + skeletonTile();

  var now = new Date();
  var html = "";

  if (e.uv !== null) {
    var uvNow = Math.round(e.uv);
    var detail = "";
    if (e.uvHourly && e.uvHourly.length > 1) {
      detail += uvCurveSvg(e.uvHourly, extrasTz, now);
      var risky = e.uvHourly.filter(function (h) {
        return h.uv >= 3;
      });
      if (risky.length) {
        detail += detailRow(
          "Moderate or higher",
          fmtLocalHour(risky[0].time) + " – " + fmtLocalHour(risky[risky.length - 1].time),
        );
      }
    }
    if (e.uvMax != null) {
      detail += detailRow(
        "Peak today",
        Math.round(e.uvMax) + " " + uvLabel(e.uvMax),
      );
    }
    detail +=
      '<div class="detail-note">' +
      uvAdvice(e.uvMax != null ? e.uvMax : e.uv) +
      " UV climbs about 10% per 3,000 ft of elevation, and snow or water reflects" +
      " most of it back at you." +
      "</div>";
    html += tile(
      "☀️ UV Index",
      uvNow + " " + uvLabel(e.uv),
      e.uvMax != null ? "Peak today " + Math.round(e.uvMax) : "",
      scaleBarHtml(
        (e.uv / 11) * 100,
        "linear-gradient(90deg,#4ade80,#facc15,#fb923c,#e879f9)",
      ),
      detail,
    );
  }

  if (e.aqi !== null) {
    var cat = aqiCategory(e.aqi);
    var aqiDetail =
      detailRow("US AQI", String(e.aqi)) +
      (e.pm25 != null ? detailRow("PM2.5", e.pm25 + " µg/m³") : "") +
      '<div class="detail-note">' + aqiMeaning(cat) + "</div>";
    html += tile(
      "🌫️ Air Quality",
      e.aqi + " " + cat,
      e.pm25 != null ? "PM2.5 " + e.pm25 + " µg/m³" : "",
      scaleBarHtml(
        (e.aqi / 300) * 100,
        "linear-gradient(90deg,#4ade80,#facc15,#fb923c,#ef4444,#a855f7)",
      ),
      aqiDetail,
    );
  }

  if (e.pressureHpa !== null) {
    var inHg = e.pressureHpa / 33.8639;
    var trend = "";
    if (e.pressureTrend !== null) {
      trend =
        e.pressureTrend > 0.6 ? "Rising" : e.pressureTrend < -0.6 ? "Falling" : "Steady";
    }
    var pDetail =
      pressureGaugeSvg(inHg) +
      detailRow("Sea level", inHg.toFixed(2) + " inHg") +
      detailRow("Millibars", Math.round(e.pressureHpa) + " hPa") +
      (e.stationHpa !== null
        ? detailRow("At this elevation", (e.stationHpa / 33.8639).toFixed(2) + " inHg")
        : "") +
      (trend ? detailRow("3-hour trend", trend) : "") +
      '<div class="detail-note">Rising pressure usually means improving weather;' +
      " a sharp fall means a storm may be on the way.</div>";
    html += tile(
      "📊 Pressure",
      inHg.toFixed(2) + '<span class="tile-unit"> inHg</span>',
      trend || "Sea level",
      pressureGaugeSvg(inHg),
      pDetail,
    );
  }

  return html;
}

function renderExtras() {
  var slot = document.getElementById("extraTiles");
  if (slot) slot.innerHTML = extrasHtml();
}

// Sun position arc for the sunrise/sunset tile, plus a hover tooltip of the
// derived solar facts. Coordinates are in the 100x38 viewBox, not pixels.
function sunArcSvg(sunTimes, timeZone, nowTime) {
  var tzOff = timeZone ? getTzOffset(timeZone, nowTime) : -nowTime.getTimezoneOffset();
  var nowLocalMin = nowTime.getUTCHours() * 60 + nowTime.getUTCMinutes() + tzOff;
  var riseFrac = sunTimes.riseLocalMin / 1440;
  var setFrac = sunTimes.setLocalMin / 1440;
  var dayFrac = nowLocalMin / 1440;
  var horizY = 28;
  var amp = 16;

  function sunPt(frac) {
    var phase = ((frac - riseFrac) / (setFrac - riseFrac)) * Math.PI;
    return { x: 5 + frac * 90, y: horizY - Math.sin(phase) * amp };
  }

  var fullPts = [];
  var boldPts = [];
  for (var i = 0; i <= 80; i++) {
    var p = sunPt(i / 80);
    fullPts.push(p.x.toFixed(1) + "," + p.y.toFixed(1));
    if (p.y <= horizY) boldPts.push(p.x.toFixed(1) + "," + p.y.toFixed(1));
  }
  var sp = sunPt(dayFrac);
  var aboveHorizon = sp.y < horizY;

  var dayHrs = Math.floor(sunTimes.dayLength / 60);
  var dayMins = Math.round(sunTimes.dayLength % 60);
  var goldenRise = new Date(sunTimes.sunrise.getTime() + 30 * 60000);
  var goldenSet = new Date(sunTimes.sunset.getTime() - 30 * 60000);
  var tooltipLines = [
    aboveHorizon ? "☀️ Sun is up" : "🌙 Sun is down",
    "Solar noon: " + fmtTimeInTz(sunTimes.solarNoon, timeZone),
    "Day length: " + dayHrs + "h " + dayMins + "m",
    "Golden hour: " + fmtTimeInTz(goldenRise, timeZone) + ", " + fmtTimeInTz(goldenSet, timeZone),
    "Declination: " + sunTimes.declination.toFixed(1) + "°",
  ];

  return (
    '<div class="sun-arc-wrap">' +
    '<svg viewBox="0 0 100 38" class="sun-arc">' +
    '<path d="M ' + fullPts.join(" L ") +
    '" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>' +
    (boldPts.length > 1
      ? '<path d="M ' + boldPts.join(" L ") +
        '" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>'
      : "") +
    '<line x1="5" y1="' + horizY + '" x2="95" y2="' + horizY +
    '" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>' +
    '<circle cx="' + sp.x.toFixed(1) + '" cy="' + sp.y.toFixed(1) + '" r="3.5" fill="' +
    (aboveHorizon ? "#fff" : "rgba(200,200,220,0.5)") + '"/>' +
    (aboveHorizon
      ? '<circle cx="' + sp.x.toFixed(1) + '" cy="' + sp.y.toFixed(1) +
        '" r="6" fill="rgba(255,255,255,0.15)"/>'
      : "") +
    "</svg>" +
    '<div class="sun-tooltip">' + tooltipLines.join("<br>") + "</div>" +
    "</div>"
  );
}

function render(city, forecast, hourlyData, grid, timeZone) {
  var periods = forecast.properties.periods;
  if (!periods || periods.length === 0) {
    showError("No forecast data");
    return;
  }

  var now = periods[0];
  var hi, lo;
  if (now.isDaytime) {
    var tonight = periods.length > 1 && !periods[1].isDaytime ? periods[1] : null;
    hi = now.temperature;
    lo = tonight ? tonight.temperature : now.temperature;
  } else {
    // at night periods[0] is "Tonight"; upcoming high is the next daytime period
    lo = now.temperature;
    hi = periods.length > 1 && periods[1].isDaytime ? periods[1].temperature : now.temperature;
  }

  var hrs = hourlyData.properties.periods;
  var currentTemp = hrs.length > 0 ? hrs[0].temperature : now.temperature;

  var feelsLike = getGridVal(grid, "apparentTemperature");
  var humidity = getGridVal(grid, "relativeHumidity");
  var dewpoint = getGridVal(grid, "dewpoint");
  var visibility = getGridVal(grid, "visibility");
  var precip = now.probabilityOfPrecipitation ? now.probabilityOfPrecipitation.value : null;

  // Hero
  var stats =
    '<div class="stat"><div class="stat-label">High / Low</div>' +
    '<div class="stat-value">' + hi + "° / " + lo + "°</div></div>";
  if (feelsLike !== null) {
    stats +=
      '<div class="stat"><div class="stat-label">Feels Like</div>' +
      '<div class="stat-value">' + cToF(feelsLike) + "°</div></div>";
  }
  if (precip !== null) {
    stats +=
      '<div class="stat"><div class="stat-label">Precip</div>' +
      '<div class="stat-value">' + precip + "%</div></div>";
  }

  var hero =
    '<div class="hero-city">' +
    esc(city) +
    '<button class="fav-btn" id="favBtn" data-city="' + esc(city) + '" ' +
    'title="Save to favorites" ' +
    'aria-label="Save to favorites" aria-pressed="' +
    (isFavorite(city) ? "true" : "false") +
    '">' +
    starSvg(isFavorite(city)) +
    "</button>" +
    "</div>" +
    '<div class="hero-temp">' + currentTemp + "°</div>" +
    '<div class="hero-condition">' + esc(now.shortForecast) + "</div>" +
    '<div class="hero-stats">' + stats + "</div>" +
    '<div class="hero-detail">' + esc(now.detailedForecast) + "</div>";

  // Hourly strip
  var hourly = '<div class="hourly-scroll">';
  var hCount = Math.min(hrs.length, 24);
  for (var i = 0; i < hCount; i++) {
    var h = hrs[i];
    hourly +=
      '<div class="hourly-item">' +
      '<div class="hourly-time">' + (i === 0 ? "Now" : fmtHour(h.startTime, timeZone)) + "</div>" +
      '<div class="hourly-icon">' + icon(h.shortForecast, h.isDaytime) + "</div>" +
      '<div class="hourly-temp">' + h.temperature + "°</div>" +
      "</div>";
  }
  hourly += "</div>";

  // Detail tiles
  extrasTz = timeZone;
  var nowTime = new Date();
  var sunTimes = calcSunTimes(parseFloat(currentLat), parseFloat(currentLon), nowTime, timeZone);
  var beforeSunset = nowTime < sunTimes.sunset;
  var dayHrs = Math.floor(sunTimes.dayLength / 60);
  var dayMins = Math.round(sunTimes.dayLength % 60);
  var tiles = tile(
    "🌅 " + (beforeSunset ? "Sunset" : "Sunrise"),
    fmtTimeInTz(beforeSunset ? sunTimes.sunset : sunTimes.sunrise, timeZone),
    beforeSunset
      ? "Sunrise: " + fmtTimeInTz(sunTimes.sunrise, timeZone)
      : "Sunset: " + fmtTimeInTz(sunTimes.sunset, timeZone),
    sunArcSvg(sunTimes, timeZone, nowTime),
    sunArcSvg(sunTimes, timeZone, nowTime) +
      detailRow("Sunrise", fmtTimeInTz(sunTimes.sunrise, timeZone)) +
      detailRow("Solar noon", fmtTimeInTz(sunTimes.solarNoon, timeZone)) +
      detailRow("Sunset", fmtTimeInTz(sunTimes.sunset, timeZone)) +
      detailRow("Daylight", dayHrs + "h " + dayMins + "m") +
      detailRow("Sun declination", sunTimes.declination.toFixed(1) + "°")
  );

  tiles += tile(
    "💨 Wind",
    esc(now.windSpeed),
    now.windDirection ? "From the " + esc(now.windDirection) : "",
    windCompassSvg(now.windDirection, now.windSpeed),
    windCompassSvg(now.windDirection, now.windSpeed) +
      detailRow("Speed", esc(now.windSpeed)) +
      (now.windDirection
        ? detailRow(
            "Direction",
            "From the " + esc(now.windDirection) +
              " (" + Math.round(dirToDeg(now.windDirection)) + "°)",
          )
        : "") +
      '<div class="detail-note">The arrow flies with the wind — weather.gov reports' +
      " the direction it blows <em>from</em>.</div>"
  );

  // UV / air quality / pressure fill in here once Open-Meteo answers
  tiles += '<div id="extraTiles" class="tile-slot">' + extrasHtml() + "</div>";

  if (humidity !== null) {
    tiles += tile(
      "💧 Humidity",
      Math.round(humidity) + '<span class="tile-unit">%</span>',
      dewpoint !== null ? "Dew point " + cToF(dewpoint) + "°F" : "",
      scaleBarHtml(humidity, "linear-gradient(90deg,#fcd34d,#7dd3fc,#2563eb)"),
      detailRow("Relative humidity", Math.round(humidity) + "%") +
        (dewpoint !== null ? detailRow("Dew point", cToF(dewpoint) + "°F") : "") +
        (dewpoint !== null
          ? '<div class="detail-note">A dew point of ' + cToF(dewpoint) + "°F means " +
            dewComfort(cToF(dewpoint)) + ".</div>"
          : "")
    );
  }

  tiles += tile(
    "☔ Precipitation",
    (precip || 0) + '<span class="tile-unit">%</span>',
    "Chance today"
  );

  if (visibility !== null) {
    var visMi = Math.round(visibility / 1609);
    tiles += tile(
      "👁️ Visibility",
      visMi + '<span class="tile-unit"> mi</span>',
      visMi >= 10 ? "Clear view" : visMi >= 5 ? "Moderate" : "Low visibility"
    );
  }

  if (feelsLike !== null) {
    tiles += tile(
      "🌡️ Feels Like",
      cToF(feelsLike) + "°",
      "Actual " + currentTemp + "°"
    );
  }

  var moon = moonPhase(nowTime);
  tiles += tile(
    "🌙 Moon",
    moon.name,
    moon.illuminationPct + "% lit",
    moonDiscSvg(moon.fraction, "moon-disc"),
    '<div class="moon-detail">' +
      moonDiscSvg(moon.fraction, "moon-disc moon-big") +
      "<div>" +
      detailRow("Illumination", moon.illuminationPct + "%") +
      detailRow("Next full moon", moon.daysToFull === 0 ? "tonight" : moon.daysToFull + " days") +
      detailRow("Next new moon", moon.daysToNew === 0 ? "tonight" : moon.daysToNew + " days") +
      "</div></div>"
  );

  // 7-day forecast — a section of the gradient card, not a card of its own, so
  // it can sit between the hourly strip and the detail tiles.
  var days = [];
  var allLo = 999;
  var allHi = -999;
  for (var di = 0; di < periods.length; di++) {
    var dp = periods[di];
    if (dp.isDaytime) {
      var nightP = di + 1 < periods.length && !periods[di + 1].isDaytime ? periods[di + 1] : null;
      var dayLo = nightP ? nightP.temperature : dp.temperature - 15;
      days.push({
        // dp.name is "This Afternoon"/"Today"/"Tonight" for the first period,
        // so slicing it gives "Thi" — take the weekday from the timestamp
        name: WEEKDAYS[new Date(dp.startTime).getDay()],
        hi: dp.temperature,
        lo: dayLo,
        forecast: dp.shortForecast,
      });
      if (dp.temperature > allHi) allHi = dp.temperature;
      if (dayLo < allLo) allLo = dayLo;
    }
  }

  var range = allHi - allLo || 1;
  var dHtml =
    '<div class="wx-divider"><div class="wx-section-title">' +
    days.length + "-Day Forecast</div><div class=\"daily-list\">";
  for (var j = 0; j < days.length; j++) {
    var d = days[j];
    var barLeft = ((d.lo - allLo) / range) * 100;
    var barWidth = ((d.hi - d.lo) / range) * 100;
    if (barWidth < 8) barWidth = 8;
    dHtml +=
      '<div class="daily-row">' +
      '<div class="daily-name">' + d.name + "</div>" +
      '<div class="daily-icon">' + icon(d.forecast, true) + "</div>" +
      '<div class="daily-low">' + d.lo + "°</div>" +
      '<div class="daily-bar-wrap"><div class="daily-bar" style="left:' + barLeft +
      "%;width:" + barWidth + '%"></div></div>' +
      '<div class="daily-high">' + d.hi + "°</div>" +
      "</div>";
  }
  dHtml += "</div></div>";

  heroEl.innerHTML =
    '<div class="wx-card ' + conditionClass(now.shortForecast, now.isDaytime) + '">' +
    '<div class="wispy-clouds">' +
    '<div class="wisp wisp-1"></div><div class="wisp wisp-2"></div>' +
    '<div class="wisp wisp-3"></div><div class="wisp wisp-4"></div>' +
    "</div>" +
    '<div class="wx-body">' +
    hero +
    '<div class="wx-divider"><div class="wx-section-title">Next 24 hours</div>' + hourly + "</div>" +
    dHtml +
    '<div class="wx-divider"><div class="tiles">' + tiles + "</div></div>" +
    "</div></div>";

  // wired after innerHTML so the button exists; lat/lon come from the globals
  // the fetch set, which are what a restored favorite needs to re-query
  var favBtn = document.getElementById("favBtn");
  if (favBtn) {
    favBtn.addEventListener("click", function () {
      var on = toggleFavorite(city, currentLat, currentLon);
      favBtn.innerHTML = starSvg(on);
      favBtn.setAttribute("aria-pressed", on ? "true" : "false");
      favBtn.title = on ? "Remove from favorites" : "Save to favorites";
      renderSaved();
    });
  }

  renderSaved();
}

// ── Search / typeahead ──
var sugEl = document.getElementById("suggestions");
var locateBtn = document.getElementById("locate");
var searchTimer = null;
var sugItems = [];
var sugIndex = -1;

function loadJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (e) {
    return null;
  }
}


// ── Saved cities list ──
// Starring is only worth anything if the saved places show their conditions at
// a glance, so each row fetches its own current temp. Results are memoised for
// the session: re-rendering the list (after a star toggle, say) must not refire
// two weather.gov requests per city.
var savedWxCache = {};

function savedRowHtml(fav, wx) {
  var right = wx
    ? '<div class="saved-temp">' + wx.temp + "\u00B0</div>" +
      '<div class="saved-hilo">H:' + wx.hi + "\u00B0 L:" + wx.lo + "\u00B0</div>"
    : '<div class="saved-temp saved-pending">--\u00B0</div>';
  var cond = wx ? esc(wx.cond) : "Loading\u2026";
  return (
    '<div class="saved-row" data-label="' + esc(fav.label) + '">' +
    '<div class="saved-left">' +
    '<div class="saved-name">' + esc(fav.label) + "</div>" +
    '<div class="saved-cond">' + cond + "</div>" +
    "</div>" +
    '<div class="saved-right">' + right + "</div>" +
    '<button class="saved-remove" data-remove="' + esc(fav.label) + '" ' +
    'title="Remove from favorites" aria-label="Remove from favorites">\u00D7</button>' +
    "</div>"
  );
}

function fetchSavedWx(fav) {
  if (savedWxCache[fav.label]) return Promise.resolve(savedWxCache[fav.label]);
  return fetch("https://api.weather.gov/points/" + fav.lat + "," + fav.lon)
    .then(function (r) {
      if (!r.ok) throw new Error("points");
      return r.json();
    })
    .then(function (pts) {
      return fetch(pts.properties.forecast).then(function (r) {
        return r.json();
      });
    })
    .then(function (fc) {
      var ps = fc.properties.periods;
      if (!ps || !ps.length) throw new Error("empty");
      var now = ps[0];
      var hi, lo;
      if (now.isDaytime) {
        hi = now.temperature;
        lo = ps.length > 1 && !ps[1].isDaytime ? ps[1].temperature : now.temperature;
      } else {
        lo = now.temperature;
        hi = ps.length > 1 && ps[1].isDaytime ? ps[1].temperature : now.temperature;
      }
      var wx = { temp: now.temperature, hi: hi, lo: lo, cond: now.shortForecast };
      savedWxCache[fav.label] = wx;
      return wx;
    })
    .catch(function () {
      return null;
    });
}

function renderSaved() {
  var favs = loadFavorites();
  if (!favs.length) {
    savedEl.innerHTML = "";
    return;
  }

  var rows = "";
  for (var i = 0; i < favs.length; i++) {
    rows += savedRowHtml(favs[i], savedWxCache[favs[i].label]);
  }
  savedEl.innerHTML =
    '<div class="card"><div class="card-head">Saved</div>' + rows + "</div>";

  savedEl.querySelectorAll(".saved-row").forEach(function (row) {
    row.addEventListener("click", function (e) {
      if (e.target.hasAttribute("data-remove")) return;
      var label = row.getAttribute("data-label");
      for (var j = 0; j < favs.length; j++) {
        if (favs[j].label === label) {
          zipInput.value = "";
          history.replaceState(null, "", "?q=" + encodeURIComponent(label));
          fetchWeather(favs[j].lat, favs[j].lon, label, true);
          return;
        }
      }
    });
  });

  savedEl.querySelectorAll("[data-remove]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var label = btn.getAttribute("data-remove");
      var f = loadFavorites().filter(function (x) {
        return x.label !== label;
      });
      localStorage.setItem("weatherFavorites", JSON.stringify(f));
      renderSaved();
      syncFavButton();
    });
  });

  // fill in the rows that don't have conditions yet
  favs.forEach(function (fav) {
    if (savedWxCache[fav.label]) return;
    fetchSavedWx(fav).then(function (wx) {
      if (wx) renderSaved();
    });
  });
}

// keeps the hero star in sync when a place is removed from the list below
function syncFavButton() {
  var btn = document.getElementById("favBtn");
  if (!btn) return;
  var label = btn.getAttribute("data-city") || "";
  var on = isFavorite(label);
  btn.innerHTML = starSvg(on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
}

// ── Favorites ──
// Keyed by label ("Redwood City, CA"), which is what the typeahead and the URL
// both round-trip, so a starred place survives a reload.
function loadFavorites() {
  var f = loadJson("weatherFavorites");
  return f && f.length ? f : [];
}

function isFavorite(label) {
  var favs = loadFavorites();
  for (var i = 0; i < favs.length; i++) {
    if (favs[i].label === label) return true;
  }
  return false;
}

function toggleFavorite(label, lat, lon) {
  var favs = loadFavorites();
  for (var i = 0; i < favs.length; i++) {
    if (favs[i].label === label) {
      favs.splice(i, 1);
      localStorage.setItem("weatherFavorites", JSON.stringify(favs));
      return false;
    }
  }
  favs.unshift({ label: label, lat: String(lat), lon: String(lon) });
  localStorage.setItem("weatherFavorites", JSON.stringify(favs.slice(0, 12)));
  return true;
}

function starSvg(filled) {
  return (
    '<svg viewBox="0 0 24 24" aria-hidden="true" class="star' +
    (filled ? " filled" : "") +
    '"><path d="M12 2.6 L15 9.2 L22 10 L16.9 14.8 L18.3 21.7 L12 18.3 ' +
    'L5.7 21.7 L7.1 14.8 L2 10 L9 9.2 Z"/></svg>'
  );
}

function saveRecent(label, lat, lon) {
  try {
    var rec = loadJson("weatherRecents") || [];
    rec = rec.filter(function (r) {
      return r.label !== label;
    });
    rec.unshift({ label: label, lat: lat, lon: lon });
    localStorage.setItem("weatherRecents", JSON.stringify(rec.slice(0, 5)));
    localStorage.setItem("weatherLast", JSON.stringify({ label: label, lat: lat, lon: lon }));
  } catch (e) {}
}

function closeSuggestions() {
  sugEl.classList.remove("active");
  sugEl.innerHTML = "";
  sugItems = [];
  sugIndex = -1;
  zipInput.setAttribute("aria-expanded", "false");
  zipInput.removeAttribute("aria-activedescendant");
}

function highlightSuggestion(idx) {
  var rows = sugEl.querySelectorAll(".suggestion-item");
  for (var i = 0; i < rows.length; i++) rows[i].classList.remove("active");
  sugIndex = idx;
  if (idx >= 0 && idx < rows.length) {
    rows[idx].classList.add("active");
    zipInput.setAttribute("aria-activedescendant", rows[idx].id);
    rows[idx].scrollIntoView({ block: "nearest" });
  }
}

function pickSuggestion(item) {
  if (item.kind === "locate") {
    closeSuggestions();
    zipInput.blur();
    locateBtn.click();
    return;
  }
  zipInput.value = item.label;
  zipInput.blur();
  closeSuggestions();
  history.replaceState(null, "", "?q=" + encodeURIComponent(item.label));
  fetchWeather(item.lat, item.lon, item.label, true);
}

function renderSuggestions(items) {
  sugEl.innerHTML = "";
  // "Use my location" is pinned to every list, so it stays reachable without
  // having to clear whatever you've already typed.
  sugItems = [{ kind: "locate", label: "Use my location", sub: "" }].concat(items || []);
  sugIndex = -1;
  sugItems.forEach(function (item, i) {
    var div = document.createElement("div");
    div.className = "suggestion-item" + (item.kind ? " " + item.kind : "");
    div.id = "sug-opt-" + i;
    div.setAttribute("role", "option");
    var icon = "";
    if (item.kind === "locate") {
      icon =
        '<svg class="sug-icon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M21 3 L3 10.5 L10.5 13.5 L13.5 21 Z" /></svg>';
    } else if (item.kind === "fav") {
      icon = starSvg(true);
    } else if (item.kind === "recent") {
      icon = '<span class="sug-icon">\uD83D\uDD52</span>';
    }
    div.innerHTML =
      '<span class="sug-city">' +
      icon +
      esc(item.label) +
      '</span><span class="sug-region">' +
      esc(item.sub || "") +
      "</span>";
    // mousedown would blur the input and close the list before click lands
    div.addEventListener("mousedown", function (e) {
      e.preventDefault();
    });
    div.addEventListener("click", function () {
      pickSuggestion(item);
    });
    div.addEventListener("mousemove", function () {
      if (sugIndex !== i) highlightSuggestion(i);
    });
    sugEl.appendChild(div);
  });
  sugEl.classList.add("active");
  zipInput.setAttribute("aria-expanded", "true");
}

// abbreviation -> full state name, for the muted right-hand column
var stateNames = {};
Object.keys(stateAbbrs).forEach(function (full) {
  stateNames[stateAbbrs[full]] = full;
});

// /api/cities is already prefix-ranked by population server-side, so this is a
// straight mapping — no client-side re-ranking needed.
function cityApiToItems(rows) {
  if (!rows || !rows.length) return [];
  return rows.map(function (r) {
    return {
      label: r.state ? r.name + ", " + r.state : r.name,
      sub: stateNames[r.state] || r.state || "",
      lat: String(r.lat),
      lon: String(r.lon),
    };
  });
}

// Nominatim ranks by its own importance score, which floats big cities to the
// top even when the typed prefix doesn't match their name at all ("red" →
// "Plymouth, MA"). Re-rank so name-prefix matches win, then substring matches;
// anything that doesn't contain the query is dropped.
function nominatimToItems(results, query) {
  var items = [];
  var seen = {};
  if (!results) return items;
  var q = (query || "").trim().toLowerCase();

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var ad = r.address || {};
    var city = ad.city || ad.town || ad.village || ad.hamlet || r.display_name.split(",")[0].trim();
    var st = ad.state || "";
    var label = st ? city + ", " + (stateAbbrs[st] || st) : city;
    if (seen[label]) continue;
    seen[label] = 1;

    var name = city.toLowerCase();
    var rank;
    if (!q || name.indexOf(q) === 0) {
      rank = 0;
    } else if (name.indexOf(q) !== -1) {
      rank = 1;
    } else {
      continue;
    }
    items.push({ label: label, sub: st || ad.postcode || "", lat: r.lat, lon: r.lon, rank: rank });
  }

  items.sort(function (a, b) {
    return a.rank - b.rank;
  });
  return items.slice(0, 5);
}

function fetchSuggestions(q) {
  // Place names come from our own /api/cities index. Nominatim is a geocoder,
  // not a search index — it can't prefix-match, so "red" never reached Redwood
  // City. ZIPs still go to Nominatim, which handles postalcode lookups fine.
  var isZip = /^\d{3,5}$/.test(q);
  if (!isZip) {
    fetch("api/cities?q=" + encodeURIComponent(q))
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (zipInput.value.trim() !== q) return;
        renderSuggestions(cityApiToItems(data));
      })
      .catch(function () {});
    return;
  }

  var url =
    "https://nominatim.openstreetmap.org/search?postalcode=" +
    encodeURIComponent(q) +
    "&country=US&format=json&limit=5&addressdetails=1";
  fetch(url, { headers: { Accept: "application/json" } })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (zipInput.value.trim() !== q) return;
      renderSuggestions(nominatimToItems(data, ""));
    })
    .catch(function () {});
}

function showDefaultSuggestions() {
  // the locate row is prepended by renderSuggestions for every list
  var items = [];
  var favs = loadFavorites();
  var seen = {};
  for (var f = 0; f < favs.length; f++) {
    seen[favs[f].label] = 1;
    items.push({
      kind: "fav",
      label: favs[f].label,
      sub: "",
      lat: favs[f].lat,
      lon: favs[f].lon,
    });
  }
  var rec = loadJson("weatherRecents") || [];
  for (var i = 0; i < rec.length; i++) {
    // a starred place is already listed above; don't show it twice
    if (seen[rec[i].label]) continue;
    items.push({ kind: "recent", label: rec[i].label, sub: "", lat: rec[i].lat, lon: rec[i].lon });
  }
  renderSuggestions(items);
}

function doSearch() {
  var z = zipInput.value.trim();
  if (z && sugItems.length > 0) {
    // index 0 is the pinned locate row — Enter should take the top *place*
    // unless the user explicitly arrowed onto something.
    var firstPlace = -1;
    for (var si = 0; si < sugItems.length; si++) {
      if (!sugItems[si].kind) {
        firstPlace = si;
        break;
      }
    }
    var pick = sugIndex >= 0 ? sugIndex : firstPlace;
    if (pick >= 0) {
      pickSuggestion(sugItems[pick]);
      return;
    }
  }
  closeSuggestions();
  if (z) geocodeAndFetch(z);
}

zipInput.addEventListener("input", function () {
  clearTimeout(searchTimer);
  var q = zipInput.value.trim();
  if (q.length === 0) {
    showDefaultSuggestions();
    return;
  }
  // City names hit our own /api/cities (sub-millisecond, no rate limit), so
  // fire on every keystroke from the first character. Only ZIPs, which still go
  // out to Nominatim, need the debounce.
  if (/^\d{3,5}$/.test(q)) {
    searchTimer = setTimeout(function () {
      fetchSuggestions(q);
    }, 400);
    return;
  }
  fetchSuggestions(q);
});

zipInput.addEventListener("focus", function () {
  if (!zipInput.value.trim()) showDefaultSuggestions();
});

zipInput.addEventListener("keydown", function (e) {
  var open = sugItems.length > 0;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!open) {
      if (!zipInput.value.trim()) showDefaultSuggestions();
      return;
    }
    highlightSuggestion((sugIndex + 1) % sugItems.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (open) highlightSuggestion((sugIndex - 1 + sugItems.length) % sugItems.length);
  } else if (e.key === "Escape") {
    closeSuggestions();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (open && sugIndex >= 0) {
      pickSuggestion(sugItems[sugIndex]);
      return;
    }
    doSearch();
  }
});

document.addEventListener("click", function (e) {
  if (!e.target.closest(".search-wrap")) closeSuggestions();
});

searchBtn.addEventListener("click", doSearch);

// Geolocation
locateBtn.addEventListener("click", function () {
  if (!navigator.geolocation) {
    showError("Geolocation not supported in this browser.");
    return;
  }
  closeSuggestions();
  locateBtn.disabled = true;
  locateBtn.classList.add("locating");
  heroEl.innerHTML = '<div class="loading">Getting location...</div>';
  function done() {
    locateBtn.disabled = false;
    locateBtn.classList.remove("locating");
  }
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      done();
      var lat = pos.coords.latitude.toFixed(4);
      var lon = pos.coords.longitude.toFixed(4);
      history.replaceState(null, "", "?q=current+location");
      zipInput.value = "";
      fetchWeather(lat, lon, null, true);
    },
    function (err) {
      done();
      if (err.code === 1) {
        showError(
          "Location permission denied. Allow location access in your browser settings, or search instead.",
        );
      } else if (err.code === 3) {
        showError("Location request timed out. Try again or search instead.");
      } else {
        showError("Could not determine your location. Try searching instead.");
      }
    },
    { timeout: 10000, enableHighAccuracy: false },
  );
});

function loadLastOrDefault() {
  var last = loadJson("weatherLast");
  if (last && last.lat) {
    fetchWeather(last.lat, last.lon, last.label, false);
  } else {
    fetchWeather(defaultLat, defaultLon, defaultCity, false);
  }
}

// Using the locate button rewrites the URL to ?q=current+location, so that URL
// gets bookmarked and reloaded. Re-locating on load must never *raise* the
// permission prompt — only resolve silently when permission is already granted.
function autoLocateIfPermitted() {
  if (!navigator.permissions || !navigator.permissions.query) {
    loadLastOrDefault();
    return;
  }
  navigator.permissions
    .query({ name: "geolocation" })
    .then(function (status) {
      if (status.state === "granted") locateBtn.click();
      else loadLastOrDefault();
    })
    .catch(loadLastOrDefault);
}

var params = new URLSearchParams(window.location.search);
var urlQuery = params.get("q") || params.get("zip");
if (urlQuery && urlQuery.replace(/\+/g, " ").trim().toLowerCase() === "current location") {
  autoLocateIfPermitted();
} else if (urlQuery) {
  zipInput.value = urlQuery;
  geocodeAndFetch(urlQuery);
} else {
  loadLastOrDefault();
}

// Installed/home-screen support. Registration failure is non-fatal — the app
// works fine as a normal page, so never surface it to the user.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
}
