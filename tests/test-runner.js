/* 最小限のテストランナー。ブラウザー（tests/*.html）と Node.js（tests/run-node.js）の両方で動く。 */
(function (root) {
  'use strict';

  const suites = [];
  let current = null;

  function describe(name, fn) {
    current = { name: name, cases: [] };
    suites.push(current);
    fn();
    current = null;
  }

  function it(name, fn) { current.cases.push({ name: name, fn: fn }); }

  function fmt(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }

  const assert = {
    ok: function (v, msg) { if (!v) throw new Error(msg || '真であるべき値が偽でした'); },
    equal: function (a, b, msg) { if (a !== b) throw new Error((msg ? msg + '：' : '') + '期待値 ' + fmt(b) + '、実際 ' + fmt(a)); },
    deepEqual: function (a, b, msg) { if (fmt(a) !== fmt(b)) throw new Error((msg ? msg + '：' : '') + '期待値 ' + fmt(b) + '、実際 ' + fmt(a)); },
    throws: function (fn, pattern, msg) {
      let thrown = null;
      try { fn(); } catch (e) { thrown = e; }
      if (!thrown) throw new Error(msg || '例外が発生しませんでした');
      if (pattern && !pattern.test(thrown.message)) throw new Error('例外メッセージが一致しません：' + thrown.message);
    }
  };

  function run() {
    const results = [];
    suites.forEach(function (s) {
      s.cases.forEach(function (c) {
        try { c.fn(); results.push({ suite: s.name, name: c.name, ok: true }); }
        catch (e) { results.push({ suite: s.name, name: c.name, ok: false, error: e.message }); }
      });
    });
    return results;
  }

  function renderToDom(results, target) {
    const failed = results.filter(function (r) { return !r.ok; }).length;
    const summary = document.createElement('p');
    summary.className = failed ? 'sum fail' : 'sum pass';
    summary.textContent = (failed ? '失敗 ' + failed + ' 件 / ' : 'すべて成功 / ') + results.length + ' 件';
    target.appendChild(summary);
    let lastSuite = null;
    let list = null;
    results.forEach(function (r) {
      if (r.suite !== lastSuite) {
        const h = document.createElement('h2');
        h.textContent = r.suite;
        target.appendChild(h);
        list = document.createElement('ul');
        target.appendChild(list);
        lastSuite = r.suite;
      }
      const li = document.createElement('li');
      li.className = r.ok ? 'pass' : 'fail';
      li.textContent = (r.ok ? '✔ ' : '✘ ') + r.name + (r.ok ? '' : ' — ' + r.error);
      list.appendChild(li);
    });
  }

  root.MJTest = { describe: describe, it: it, assert: assert, run: run, renderToDom: renderToDom };
})(typeof window !== 'undefined' ? window : globalThis);
