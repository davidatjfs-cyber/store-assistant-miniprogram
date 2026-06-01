/**
 * 营销看板：按规则汇总 issued/used/roi，今日大盘与 TOP 规则（供小程序展示）
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

function shanghaiDateKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function shanghaiDateKeysLastNDays(n) {
  const keys = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 86400000);
    keys.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }));
  }
  return keys;
}

function emptyRuleAgg() {
  return {
    issued_count: 0,
    used_count: 0,
    revenue_fen: 0,
    issued_value_fen: 0,
    cost_fen: 0,
    by_segment: {}
  };
}

function mergeRow(agg, row) {
  agg.issued_count += row.issued_count || 0;
  agg.used_count += row.used_count || 0;
  agg.revenue_fen += row.revenue || 0;
  agg.issued_value_fen += row.issued_value || 0;
  agg.cost_fen += row.cost || 0;
  const seg = row.user_segment || 'prospect';
  if (!agg.by_segment[seg]) {
    agg.by_segment[seg] = {
      issued_count: 0,
      used_count: 0,
      revenue_fen: 0,
      issued_value_fen: 0,
      roi: null
    };
  }
  const s = agg.by_segment[seg];
  s.issued_count += row.issued_count || 0;
  s.used_count += row.used_count || 0;
  s.revenue_fen += row.revenue || 0;
  s.issued_value_fen += row.issued_value || 0;
  s.roi = s.issued_value_fen > 0 ? s.revenue_fen / s.issued_value_fen : null;
}

function finalizeAgg(agg) {
  agg.roi = agg.issued_value_fen > 0 ? agg.revenue_fen / agg.issued_value_fen : null;
  return agg;
}

function isDbCollectionMissingError(err) {
  const s = String((err && (err.message || err.errMsg)) || err || '');
  return (
    s.indexOf('-502005') !== -1 ||
    s.indexOf('not exist') !== -1 ||
    s.indexOf('ResourceNotFound') !== -1
  );
}

async function getActiveStaffByOpenid(db, openid) {
  if (!openid) return null;
  const r = await db
    .collection('staff')
    .where({ openid: openid, active: true })
    .limit(1)
    .get();
  return r.data.length ? r.data[0] : null;
}

function normalizeStaffRole(row) {
  if (!row) return null;
  let role = String(row.role || 'staff').toLowerCase();
  if (role !== 'staff' && role !== 'manager' && role !== 'admin') {
    role = 'staff';
  }
  return role;
}

function pickStoreId(row) {
  if (!row) return '';
  const v =
    row.store_id != null && String(row.store_id).trim()
      ? row.store_id
      : row.storeId != null
        ? row.storeId
        : '';
  return String(v).trim();
}

function statsWhereForDate(dateKey, storeScope) {
  const w = { date: dateKey };
  if (storeScope) {
    w.store_id = storeScope;
  }
  return w;
}

exports.main = async function (event, context) {
  const db = cloud.database();
  const { OPENID } = cloud.getWXContext();
  const today = shanghaiDateKey();
  const last7 = shanghaiDateKeysLastNDays(7);

  try {
    const staff = await getActiveStaffByOpenid(db, OPENID);
    const viewerRole = normalizeStaffRole(staff);
    if (viewerRole !== 'manager' && viewerRole !== 'admin') {
      return { success: false, message: '无权限' };
    }
    let storeScope = null;
    if (viewerRole === 'manager') {
      storeScope = pickStoreId(staff);
      if (!storeScope) {
        return { success: false, message: '店长账号未绑定门店' };
      }
    } else if (viewerRole === 'admin' && event.store_id) {
      storeScope = String(event.store_id).trim();
    }

    let statsToday;
    try {
      statsToday = await db
        .collection('marketing_stats')
        .where(statsWhereForDate(today, storeScope))
        .limit(1000)
        .get();
    } catch (e0) {
      if (isDbCollectionMissingError(e0)) {
        statsToday = { data: [] };
      } else {
        throw e0;
      }
    }

    const todayTotals = {
      issued_count: 0,
      used_count: 0,
      revenue_fen: 0,
      issued_value_fen: 0
    };

    const byRuleToday = {};

    for (let i = 0; i < statsToday.data.length; i++) {
      const row = statsToday.data[i];
      const rid = row.rule_id;
      if (!rid) continue;
      todayTotals.issued_count += row.issued_count || 0;
      todayTotals.used_count += row.used_count || 0;
      todayTotals.revenue_fen += row.revenue || 0;
      todayTotals.issued_value_fen += row.issued_value || 0;
      if (!byRuleToday[rid]) byRuleToday[rid] = emptyRuleAgg();
      mergeRow(byRuleToday[rid], row);
    }

    const ruleIds = Object.keys(byRuleToday);
    const rulesMeta = {};
    for (let j = 0; j < ruleIds.length; j++) {
      try {
        const doc = await db.collection('marketing_rules').doc(ruleIds[j]).get();
        if (doc.data) {
          rulesMeta[ruleIds[j]] = {
            name: doc.data.name || '',
            active: !!doc.data.active,
            priority: doc.data.priority,
            dynamic_priority: doc.data.dynamic_priority
          };
        }
      } catch (e) {
        rulesMeta[ruleIds[j]] = { name: '' };
      }
    }

    const rulesTodayList = [];
    for (let k = 0; k < ruleIds.length; k++) {
      const id = ruleIds[k];
      const agg = finalizeAgg(byRuleToday[id]);
      rulesTodayList.push({
        rule_id: id,
        name: (rulesMeta[id] && rulesMeta[id].name) || '',
        meta: rulesMeta[id] || {},
        issued_count: agg.issued_count,
        used_count: agg.used_count,
        revenue_fen: agg.revenue_fen,
        issued_value_fen: agg.issued_value_fen,
        cost_fen: agg.cost_fen,
        roi: agg.roi,
        by_segment: agg.by_segment
      });
    }

    const allRulesSnap = await db.collection('marketing_rules').limit(200).get();
    const seenRid = {};
    for (let a = 0; a < rulesTodayList.length; a++) {
      seenRid[rulesTodayList[a].rule_id] = true;
    }
    for (let b = 0; b < allRulesSnap.data.length; b++) {
      const r = allRulesSnap.data[b];
      if (!r._id || seenRid[r._id]) continue;
      seenRid[r._id] = true;
      rulesTodayList.push({
        rule_id: r._id,
        name: r.name || '',
        meta: {
          name: r.name || '',
          active: !!r.active,
          priority: r.priority,
          dynamic_priority: r.dynamic_priority
        },
        issued_count: 0,
        used_count: 0,
        revenue_fen: 0,
        issued_value_fen: 0,
        cost_fen: 0,
        roi: null,
        by_segment: {}
      });
    }

    const byRule7d = {};
    for (let d = 0; d < last7.length; d++) {
      const dk = last7[d];
      let snap;
      try {
        snap = await db
          .collection('marketing_stats')
          .where(statsWhereForDate(dk, storeScope))
          .limit(1000)
          .get();
      } catch (e7) {
        if (isDbCollectionMissingError(e7)) {
          snap = { data: [] };
        } else {
          throw e7;
        }
      }
      for (let x = 0; x < snap.data.length; x++) {
        const row = snap.data[x];
        const rid = row.rule_id;
        if (!rid) continue;
        if (!byRule7d[rid]) byRule7d[rid] = emptyRuleAgg();
        mergeRow(byRule7d[rid], row);
      }
    }

    const rules7dList = [];
    const r7ids = Object.keys(byRule7d);
    for (let z = 0; z < r7ids.length; z++) {
      const rid = r7ids[z];
      if (!rulesMeta[rid]) {
        try {
          const doc = await db.collection('marketing_rules').doc(rid).get();
          rulesMeta[rid] = doc.data
            ? {
                name: doc.data.name || '',
                active: !!doc.data.active,
                priority: doc.data.priority,
                dynamic_priority: doc.data.dynamic_priority
              }
            : { name: '' };
        } catch (e1) {
          rulesMeta[rid] = { name: '' };
        }
      }
    }
    for (let y = 0; y < r7ids.length; y++) {
      const id = r7ids[y];
      const agg = finalizeAgg(byRule7d[id]);
      rules7dList.push({
        rule_id: id,
        name: (rulesMeta[id] && rulesMeta[id].name) || '',
        issued_count: agg.issued_count,
        used_count: agg.used_count,
        revenue_fen: agg.revenue_fen,
        issued_value_fen: agg.issued_value_fen,
        roi: agg.roi
      });
    }

    const topByRoi = rules7dList
      .filter(function (r) {
        return r.roi != null && r.issued_value_fen >= 5000;
      })
      .sort(function (a, b) {
        return (b.roi || 0) - (a.roi || 0);
      })
      .slice(0, 10);

    rulesTodayList.sort(function (a, b) {
      if (b.issued_count !== a.issued_count) {
        return b.issued_count - a.issued_count;
      }
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
    });

    return {
      success: true,
      date: today,
      viewer_role: viewerRole,
      store_scope: storeScope || '',
      today: {
        summary: todayTotals,
        rules: rulesTodayList
      },
      last_7d: {
        rules: rules7dList
      },
      top_rules_by_roi: topByRoi
    };
  } catch (err) {
    console.error('getMarketingDashboard', err);
    return {
      success: false,
      message: err.message || String(err)
    };
  }
};
