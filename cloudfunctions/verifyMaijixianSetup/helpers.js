async function onVerifySuccessUserSide(db, userId) {
  if (!userId) return;
  try {
    await db
      .collection('users')
      .doc(userId)
      .update({
        data: {
          last_verify_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      });
  } catch (e) {
    console.warn('users last_verify_at', e);
  }
  try {
    const r = await db.collection('user_tags').where({ user_id: userId, tag: 'inactive' }).get();
    for (let i = 0; i < r.data.length; i++) {
      await db.collection('user_tags').doc(r.data[i]._id).remove();
    }
  } catch (e2) {
    console.warn('remove inactive tag', e2);
  }
}

async function logAnalytics(db, payload) {
  try {
    await db.collection('analytics_logs').add({
      data: {
        user_id: payload.user_id != null ? String(payload.user_id) : '',
        action: String(payload.action || ''),
        metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
        created_at: db.serverDate()
      }
    });
  } catch (e) {
    console.error('analytics_logs', e);
  }
}

/**
 * 在职员工：staff.openid + active === true
 */
async function findActiveStaff(db, openid) {
  if (!openid) return null;
  const r = await db
    .collection('staff')
    .where({ openid: openid, active: true })
    .limit(1)
    .get();
  return r.data.length ? r.data[0] : null;
}

/** 中国时区（上海）当前星期：1=周一 … 7=周日 */
function getChinaWeekday1to7(d) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short'
  }).formatToParts(d);
  const w = parts.find(function (p) {
    return p.type === 'weekday';
  });
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[w && w.value] || 1;
}

/** 中国时区从当天 00:00 起的分钟数 */
function minutesSinceMidnightChina(d) {
  const s = d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const segs = s.split(':');
  const hh = parseInt(segs[0], 10) || 0;
  const mm = parseInt(segs[1], 10) || 0;
  return hh * 60 + mm;
}

function parseHHMM(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * 校验模板规则；verifyStoreId 为当前核销门店
 * order_amount_fen：可选，满 min_spend 时用
 */
function checkTemplateRules(template, ctx) {
  const verifyStoreId = ctx.verifyStoreId != null ? String(ctx.verifyStoreId).trim() : '';
  const orderAmountFen =
    ctx.order_amount_fen != null && ctx.order_amount_fen !== ''
      ? parseInt(ctx.order_amount_fen, 10)
      : null;
  const now = ctx.now || new Date();

  const storeIds = template.store_ids;
  if (Array.isArray(storeIds) && storeIds.length > 0) {
    if (!verifyStoreId || storeIds.indexOf(verifyStoreId) < 0) {
      return { ok: false, message: '该券不可在本门店使用' };
    }
  }

  if (ctx.voucher_store_id && String(ctx.voucher_store_id).trim()) {
    if (verifyStoreId !== String(ctx.voucher_store_id).trim()) {
      return { ok: false, message: '该券不可在本门店使用' };
    }
  }

  const weekdays = template.valid_weekdays;
  if (Array.isArray(weekdays) && weekdays.length > 0) {
    const wd = getChinaWeekday1to7(now);
    if (weekdays.indexOf(wd) < 0) {
      return { ok: false, message: '该券今日不可用' };
    }
  }

  const range = template.valid_time_range;
  if (range && typeof range === 'object' && range.start && range.end) {
    const cur = minutesSinceMidnightChina(now);
    const st = parseHHMM(String(range.start));
    const en = parseHHMM(String(range.end));
    if (st != null && en != null) {
      let okTime = false;
      if (st <= en) {
        okTime = cur >= st && cur <= en;
      } else {
        okTime = cur >= st || cur <= en;
      }
      if (!okTime) {
        return { ok: false, message: '该券不在可用时段内' };
      }
    }
  }

  const minSpend = template.min_spend;
  if (minSpend != null && Number(minSpend) > 0) {
    if (orderAmountFen == null || isNaN(orderAmountFen)) {
      return { ok: false, message: '请先录入本单消费金额（分）以校验满减门槛' };
    }
    if (orderAmountFen < Number(minSpend)) {
      return {
        ok: false,
        message: '未满足最低消费门槛（需满 ' + Number(minSpend) + ' 分）'
      };
    }
  }

  return { ok: true };
}

module.exports = {
  logAnalytics,
  findActiveStaff,
  checkTemplateRules,
  onVerifySuccessUserSide
};
