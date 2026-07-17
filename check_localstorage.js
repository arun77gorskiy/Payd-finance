// Проверка: какие ключи есть в localStorage на странице intelligence-v2
// (для запуска в браузере через консоль)

(function() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        keys.push(localStorage.key(i));
    }

    const result = {
        localStorageTotalKeys: keys.length,
        localStorageKeys: keys,
        hasProjectCache: keys.some(k => k.includes('project')),
        hasJsonCache: keys.some(k => k.includes('json')),
    };

    console.log('=== LOCALSTORAGE CHECK ===');
    console.log(JSON.stringify(result, null, 2));

    return result;
})();
