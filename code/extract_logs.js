// Финальный скрипт для извлечения логов из интерактивного браузера
(async () => {
  const result = await page.evaluate(() => {
    const logs = window.__labLogs || [];
    const titleStr = 'LOGS:' + JSON.stringify(logs.slice(-50).map(l => l.level + ':' + l.msg));
    document.title = titleStr;
    return {
      logCount: logs.length,
      logs: logs.slice(-50).map(l => ({ level: l.level, msg: l.msg })),
      title: titleStr,
      hasLabLogs: typeof window.__labLogs !== 'undefined',
      sample: logs.length > 0 ? logs[0] : null
    };
  });
  console.log('RESULT:', JSON.stringify(result, null, 2));
})();