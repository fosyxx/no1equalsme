/* ================= Стенография (R40) =================
   Новый самостоятельный раздел: рисование знаков по букве + чтение знаков.
   Правила ТЗ:
   • данные ./data/stenography.json грузятся независимо: их ошибка НЕ ломает
     слова, языки и морзе (свой кэш nem_steno_cache_v1, свой try/catch везде);
   • картинки карточек ленивые: в режиме рисования они вообще не нужны
     (эталон рисуем из шаблонов), в режиме читаем — один знак на экран;
     SVG → при неудаче PNG → при неудаче рисуем из шаблонов (тренировка идёт);
   • грейд полностью локальный: chamfer двусторонний по сетке 64², нормализация
     только uniform-scale [0.85..1.15] и сдвиг-дрейф ≤14 (позиция относительно
     контрольной/основной линий — смысл знака, поэтому центроид не выравниваем),
     ротация ±7°, штрафы за лишний/пропущенный штрих (парная привязка) и петлю,
     бонус направления НЕ может один решить исход;
   • автопроверка через 420 мс после отрывания пальца (никогда не в момент
     росчерка); кнопка «Проверить» отсутствует; ошибка → серый эталон ПОД
     штрихом пользователя, остаёмся на букве, вес буквы растёт;
   • дневная цель 10 → экран «Цель выполнена» + «Продолжить тренировку»;
     прогресс стено — отдельные ключи, к морзе/словам не имеет отношения;
   • вибрация только на результатах (success/error), не на движениях.
   Константы скоринга обязаны совпадать с валидатором steno/gen_steno.py. */
/* Встроенный пакет знаков: мгновенная готовность без сети (file://, offline,
   свежий Pages ещё не отдаёт data/). Регенерится steno/repack.js по START/END маркерам ниже. */
var STENO_SVG_BUILTIN=/*STENO-SVG-BUILTIN-START*/{"./assets/stenography/signs/steno-01-a.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTk0Ljk3IDEwOS42OSBMIDYxLjAzIDIwOC4yNiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==","./assets/stenography/signs/steno-02-b.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTY2LjQ2IDY3LjQ0IEwgMTAwLjg1IDE1Ni41NSBDIDEwMC44NSAxNTYuNTUgODkuNTQgMTcxLjY1IDk5LjM0IDE3Ni45NCBDIDEwOS4xNSAxODIuMjIgMTIxLjk3IDE3My4xNiAxMjggMTY0Ljg2IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-03-v.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTA3Ljc1IDE3OC4zIEwgMTMzLjY3IDEzNy43NCBDIDEzMy42NyAxMzcuNzQgMTQ4LjI1IDExNi42NSAxMzguNTMgMTEyLjYgQyAxMjguODEgMTA4LjU0IDEyMC43MSAxMTcuNDYgMTE0LjIzIDEyNi4zOSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==","./assets/stenography/signs/steno-04-g.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gOTUuNTUgMTc5LjEzIEwgMTIzLjg2IDEwOS42IEMgMTIzLjg2IDEwOS42IDE0MS40NCA3MS42MSAxNDcuNTggNjMuNjQgQyAxNTMuNzIgNTUuNjYgMTYwLjQ1IDU0LjQgMTYwLjQ1IDY1LjcgQyAxNjAuNDUgNzMuOTYgMTM4Ljc5IDEwOC4xOSAxMjMuNTUgMTExLjMyIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-05-d.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTA3LjQ3IDE1OC43MiBDIDExNC41MiAxNTguOTMgMTMwLjg0IDE1My43NSAxMzIuODUgMTY1LjE0IEMgMTM0Ljg1IDE3Ni41NCAxMjUuMzEgMTgwLjUgMTE3LjggMTc3Ljc5IEMgMTEwLjI5IDE3NS4wNyAxMTkuMDYgMTU5LjA0IDEyNy43NyAxNTguMzcgQyAxMzYuNDcgMTU3LjcgMTQ2LjEgMTU4LjQ0IDE0OC41MyAxNTcuNyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==","./assets/stenography/signs/steno-06-e.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gODMuNDggMTc4Ljk5IEwgMTcyLjUyIDEyNy44IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-08-zh.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTE4LjQ4IDEyNi4wNiBDIDEyOS4wNyAxMTQuMDkgMTUyLjI2IDEwMC43IDE0Ni4yNyAxMjMuNzcgQyAxNDAuMjcgMTQ2Ljg0IDExOC4zOSAxODQgMTExLjA2IDE3OC42IEMgMTAzLjc0IDE3My4yMSAxMTguNjggMTU3LjgzIDEzMC42NCAxNTguMiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==","./assets/stenography/signs/steno-09-z.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTA2LjYyIDE3Ny43OSBDIDExMC42MyAxNzcuOTIgMTI2LjkzIDE4MC41OSAxMzMuODggMTYxLjYxIEMgMTI4IDE3OS4yNiAxMzAgMTgxLjI2IDE0OS4zOCAxNzUuMjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI5IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=","./assets/stenography/signs/steno-10-i.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gNzAuNDQgMTc5LjM4IEwgMTg1LjU2IDExMS4xNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==","./assets/stenography/signs/steno-11-y-kratkoe.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTIzIDc4IEMgMTM0IDc3IDEzNyA4NSAxMjkgOTUgQyAxMjYgOTkgMTIzIDEwMSAxMTkgMTAzIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-12-k.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTA5LjY3IDE3OS4zOCBMIDE0Ni4zMyAxMTEuMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI5IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=","./assets/stenography/signs/steno-13-l.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTQzLjA1IDE3NyBDIDEzOC40NiAxNzcuNDMgMTA5LjU4IDE4MC45IDEwNC44IDE2Ny4yIEMgMTAwLjE5IDE1My45NyAxMTcuOTEgMTM1LjQxIDEyNS4zNiAxMjYuNiBDIDEzMi44MiAxMTcuNzggMTQ2LjEyIDEwOC4yOCAxNTUuNzUgMTExLjM3IEMgMTY1LjM5IDExNC40NyAxNTcuOTMgMTM1Ljc1IDE1NC41NyAxNDEuNTYgQyAxNTAuODEgMTQ4LjA3IDE0Mi4xMSAxNTkuMDUgMTMzLjkzIDE2OC4wMSBDIDEyNi41MyAxNzYuMTEgMTA2LjM2IDE3OC40MSA5MC42MSAxNzcuMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI5IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=","./assets/stenography/signs/steno-14-m.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTM3LjUyIDE2My41NyBDIDEyNi45MyAxNzUuNTMgMTAzLjc0IDE4OC45MiAxMDkuNzMgMTY1Ljg1IEMgMTE1LjczIDE0Mi43OCAxMzcuNjEgMTA1LjYyIDE0NC45NCAxMTEuMDIgQyAxNTIuMjYgMTE2LjQxIDEzNS40NSAxMzUuNTQgMTIzLjQ5IDEzNS4xNyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==","./assets/stenography/signs/steno-15-n.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTA1LjcgMTc4LjE2IEMgMTEyLjQ4IDE3NC4yNCAxMTQuODIgMTcwLjMyIDEyMS42MSAxNzAuMzIgQyAxMjguNCAxNzAuMzIgMTMwLjY5IDE3Ny42NCAxMzcuNTIgMTc3LjY0IEMgMTQ0LjM1IDE3Ny42NCAxNTAuMyAxNjguNzYgMTUwLjMgMTY4Ljc2IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-16-o.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTQ0LjEzIDE2OS40IEwgMTExLjg3IDE2OS41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-17-p.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTQ4LjI1IDExMS41MyBMIDEyMi4zMyAxNTIuMDggQyAxMjIuMzMgMTUyLjA4IDEwNy43NSAxNzMuMTcgMTE3LjQ3IDE3Ny4yMyBDIDEyNy4xOSAxODEuMjkgMTM1LjI5IDE3Mi4zNiAxNDEuNzcgMTYzLjQ0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-18-r.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTQ4LjUzIDE3NC42OSBDIDE0MS40OCAxNzQuNDggMTI1LjE2IDE4MS41OCAxMjMuMTUgMTcwLjE4IEMgMTIxLjE1IDE1OC43OCAxMjYuODYgMTU2LjEgMTM0LjM3IDE1OC44MiBDIDE0MS44OCAxNjEuNTMgMTM2Ljk0IDE3Ni4yOCAxMjguMjMgMTc2Ljk1IEMgMTE5LjUzIDE3Ny42MiAxMDkuOSAxNzYuODkgMTA3LjQ3IDE3Ny42MiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==","./assets/stenography/signs/steno-19-s.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTIyLjQ3IDE2NS4yNiBDIDExMS44MiAxNzYuNzYgMTMwLjEyIDE4Ni45NyAxNDQuMTggMTY0LjYyIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-20-t.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTMzLjUzIDE4MC4xMyBDIDE0NC4xOCAxNjguNjQgMTI1Ljg4IDE1OC40MiAxMTEuODIgMTgwLjc3IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-21-u.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTc2LjIxIDE2OS40IEwgNzkuNzkgMTY5LjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI5IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=","./assets/stenography/signs/steno-22-f.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTE4LjQ4IDEyNS45OSBDIDEyOS4wNyAxMTQuMDIgMTUyLjI2IDEwMC42MyAxNDYuMjcgMTIzLjcgQyAxNDAuMjcgMTQ2Ljc3IDExOC4zOSAxODMuOTMgMTExLjA2IDE3OC41MyBDIDEwMy43NCAxNzMuMTQgMTE4LjY4IDE1Ny43NiAxMzAuNjQgMTU4LjEyIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-23-h.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTA4LjE4IDE3OS4wNiBMIDEyNS40NyAxNDAuMjIgQyAxMjUuNDcgMTQwLjIyIDEzNi4yIDExOS4wMSAxMzkuOTUgMTE0LjU1IEMgMTQzLjcxIDExMC4xIDE0Ny44MiAxMDkuNCAxNDcuODIgMTE1LjcxIEMgMTQ3LjgyIDEyMC4zMiAxMzQuNTkgMTM5LjQ0IDEyNS4yOCAxNDEuMTkiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI5IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=","./assets/stenography/signs/steno-24-ts.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTUwLjY5IDE0Mi43IEMgMTYxLjA2IDE0MC43NSAxNzQuNTIgMTIxLjM3IDE3NC41MiAxMTYuMjMgQyAxNzQuNTIgMTA5LjIgMTY5Ljk0IDEwOS45OSAxNjUuNzYgMTE0Ljk1IEMgMTYxLjU4IDExOS45MSAxNDkuNjIgMTQzLjU1IDE0OS42MiAxNDMuNTUgTCAxMDUuNDYgMjMzLjc2IEMgMTAwLjYxIDI0MS43MyA4Ni4xNSAyNDMuODcgODMuODEgMjM0LjkgQyA4MS40OCAyMjUuOTMgMTA4LjkzIDE4MS40OSAxMzEuMTEgMTgxLjQ5IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-25-ch.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTQyLjg3IDE1NS4xMyBDIDEyNi4zMyAxNzMuODIgOTAuMTIgMTk0LjczIDk5LjQ4IDE1OC43IEMgMTA4Ljg0IDEyMi42OCAxNDMuMDEgNjQuNjUgMTU0LjQ1IDczLjA4IEMgMTY1Ljg4IDgxLjUgMTM5LjY0IDExMS4zNyAxMjAuOTYgMTEwLjc5IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-26-sh.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTU1LjQ5IDExMC43NCBDIDEzOS4yNCAxMTEuMiAxMjYuMTUgMTI0Ljc2IDEyMi4yNSAxMjkuNjYgQyAxMTguMzQgMTM0LjU2IDExNy4xOCAxMzQuNTggMTIyLjI4IDEzOC45OSBDIDEyNy4zNyAxNDMuNCAxMjguMiAxNDUuMSAxMjguMiAxNTEuOTggQyAxMjguMiAxNTguODUgMTI1LjIyIDE2Mi45NyAxMjIuNDggMTY3LjEgQyAxMTkuNzMgMTcxLjIyIDExMS41IDE4My41OSAxMDYgMTc1LjU3IEMgMTAwLjUxIDE2Ny41NSAxMjEuMzMgMTU5LjUzIDEzMS44NiAxNTkuMDgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI5IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=","./assets/stenography/signs/steno-27-shch.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTEyLjk1IDExMC45OSBDIDExNy41NCAxMTAuNTYgMTQ2LjQzIDEwNy4wOSAxNTEuMiAxMjAuOCBDIDE1NS44MSAxMzQuMDIgMTM4LjA5IDE1Mi41OCAxMzAuNjQgMTYxLjQgQyAxMjMuMTggMTcwLjIxIDEwOS44OCAxNzkuNzEgMTAwLjI1IDE3Ni42MiBDIDkwLjYxIDE3My41MiA5OC4wNyAxNTIuMjQgMTAxLjQzIDE0Ni40MyBDIDEwNS4xOSAxMzkuOTIgMTEzLjg5IDEyOC45NCAxMjIuMDcgMTE5Ljk4IEMgMTI5LjQ3IDExMS44OCAxNDkuNjQgMTA5LjU4IDE2NS4zOSAxMTAuODEiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI5IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=","./assets/stenography/signs/steno-28-hard.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxjaXJjbGUgY3g9IjEyOCIgY3k9Ijg5IiByPSI3IiBmaWxsPSIjZmZmIi8+PC9zdmc+","./assets/stenography/signs/steno-29-y.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gNzAuNDQgMTc5LjM4IEwgMTg1LjU2IDExMS4xNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxwYXRoIGQ9Ik0gMTQzIDIxMSBMIDE1MyAxOTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI5IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=","./assets/stenography/signs/steno-30-soft.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxjaXJjbGUgY3g9IjEyOCIgY3k9Ijg5IiByPSI3IiBmaWxsPSIjZmZmIi8+PC9zdmc+","./assets/stenography/signs/steno-31-eh.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gODMuNDggMTc4Ljk5IEwgMTcyLjUyIDEyNy44IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTSAxNDMgMjExIEwgMTUzIDE5MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==","./assets/stenography/signs/steno-32-yu.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTc2LjIxIDE2OS40IEwgNzkuNzkgMTY5LjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI5IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNIDE0MyAyMTEgTCAxNTMgMTkwIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iOSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+","./assets/stenography/signs/steno-33-ya.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiByb2xlPSJpbWciPjxwYXRoIGQ9Ik0gMjQgODAgSCAyMzIgTSAyNCAxODAgSCAyMzIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMTQiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik0gMTk0Ljk3IDEwOS42OSBMIDYxLjAzIDIwOC4yNiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjkiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxwYXRoIGQ9Ik0gMTQzIDIxMSBMIDE1MyAxOTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI5IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4="}/*STENO-SVG-BUILTIN-END*/; // точные SVG из ГЕСС — картинки доступны и без сети
var STENO_BUILTIN=/*STENO-BUILTIN-START*/{"schemaVersion":1,"contentVersion":2,"language":"ru","updatedAt":"2026-10-13","space":{"size":256,"controlY":80,"baselineY":180},"cards":[{"id":"st_a","letter":"А","hint":"две меры · писать снизу вверх","svg":"./assets/stenography/signs/steno-01-a.svg","png":"./assets/stenography/signs/steno-01-a.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["А"],"ambiguityNote":null,"templates":[[[[195,109.7],[193,111.2],[191,112.6],[189,114.1],[187,115.6],[185,117],[183,118.5],[181,120],[179,121.5],[177,122.9],[175,124.4],[173,125.9],[171,127.3],[169,128.8],[167,130.3],[165,131.8],[163,133.2],[161,134.7],[159,136.2],[157,137.6],[155,139.1],[153,140.6],[151,142.1],[149,143.5],[147,145],[145,146.5],[143,147.9],[141,149.4],[139,150.9],[137,152.4],[135,153.8],[133,155.3],[131,156.8],[129,158.2],[127,159.7],[125,161.2],[123,162.7],[121,164.1],[119,165.6],[117,167.1],[115,168.5],[113,170],[111,171.5],[109,173],[107,174.4],[105,175.9],[103,177.4],[101,178.8],[99,180.3],[97,181.8],[95,183.2],[93,184.7],[91,186.2],[89,187.7],[87,189.1],[85,190.6],[83,192.1],[81,193.5],[79,195],[77,196.5],[75,198],[73,199.4],[71,200.9],[69,202.4],[67,203.8],[65,205.3],[63,206.8],[61,208.3]]]]},{"id":"st_b","letter":"Б","hint":"две меры · писать сверху вниз","svg":"./assets/stenography/signs/steno-02-b.svg","png":"./assets/stenography/signs/steno-02-b.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Б"],"ambiguityNote":null,"templates":[[[[166.5,67.4],[165,69.5],[163.5,71.5],[162,73.5],[160.5,75.5],[159.1,77.5],[157.6,79.5],[156.1,81.5],[154.6,83.5],[153.1,85.6],[151.6,87.6],[150.2,89.6],[148.7,91.6],[147.2,93.6],[145.7,95.6],[144.2,97.6],[142.7,99.6],[141.3,101.7],[139.8,103.7],[138.3,105.7],[136.8,107.7],[135.3,109.7],[133.9,111.7],[132.4,113.7],[130.9,115.7],[129.4,117.8],[127.9,119.8],[126.4,121.8],[125,123.8],[123.5,125.8],[122,127.8],[120.5,129.8],[119,131.8],[117.6,133.9],[116.1,135.9],[114.6,137.9],[113.1,139.9],[111.6,141.9],[110.1,143.9],[108.7,145.9],[107.2,148],[105.7,150],[104.2,152],[102.7,154],[101.3,156],[99.8,158.1],[98.5,160.2],[97.4,162.4],[96.4,164.7],[95.7,167.1],[95.4,169.6],[95.6,172.1],[96.5,174.4],[98.2,176.2],[100.4,177.4],[102.7,178.2],[105.2,178.5],[107.7,178.4],[110.2,177.9],[112.5,177.1],[114.8,176.1],[117,174.9],[119.1,173.6],[121.1,172.1],[123,170.4],[124.8,168.7],[126.5,166.8],[128,164.9]]]]},{"id":"st_v","letter":"В","hint":"одна мера · писать сверху вниз","svg":"./assets/stenography/signs/steno-03-v.svg","png":"./assets/stenography/signs/steno-03-v.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["В"],"ambiguityNote":null,"templates":[[[[107.8,178.3],[109.1,176.2],[110.4,174.1],[111.8,172],[113.1,169.9],[114.4,167.8],[115.8,165.7],[117.1,163.6],[118.5,161.6],[119.8,159.5],[121.1,157.4],[122.5,155.3],[123.8,153.2],[125.1,151.1],[126.5,149],[127.8,146.9],[129.2,144.8],[130.5,142.7],[131.8,140.6],[133.2,138.5],[134.5,136.4],[135.8,134.3],[137.1,132.2],[138.2,130],[139.3,127.7],[140.2,125.4],[141,123.1],[141.6,120.7],[141.9,118.2],[141.5,115.8],[140.2,113.7],[138.1,112.4],[135.7,111.8],[133.2,111.6],[130.8,112],[128.4,112.8],[126.2,113.9],[124.2,115.4],[122.3,117],[120.5,118.7],[118.8,120.5],[117.2,122.4],[115.7,124.4],[114.2,126.4]]]]},{"id":"st_g","letter":"Г","hint":"две меры · писать сверху вниз","svg":"./assets/stenography/signs/steno-04-g.svg","png":"./assets/stenography/signs/steno-04-g.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Г"],"ambiguityNote":null,"templates":[[[[95.6,179.1],[96.5,176.8],[97.4,174.5],[98.4,172.2],[99.3,169.9],[100.2,167.6],[101.2,165.3],[102.1,163],[103,160.7],[104,158.4],[104.9,156.1],[105.9,153.8],[106.8,151.5],[107.7,149.2],[108.7,146.9],[109.6,144.6],[110.5,142.3],[111.5,140],[112.4,137.7],[113.3,135.4],[114.3,133.1],[115.2,130.8],[116.2,128.5],[117.1,126.2],[118,123.9],[119,121.6],[119.9,119.3],[120.8,117],[121.8,114.7],[122.7,112.4],[123.6,110.1],[124.7,107.9],[125.7,105.6],[126.8,103.4],[127.9,101.1],[128.9,98.9],[130,96.6],[131.1,94.4],[132.2,92.2],[133.3,89.9],[134.4,87.7],[135.5,85.5],[136.6,83.3],[137.7,81.1],[138.8,78.8],[140,76.6],[141.1,74.4],[142.3,72.3],[143.5,70.1],[144.8,67.9],[146.1,65.8],[147.5,63.8],[149.1,61.9],[150.8,60.1],[152.8,58.6],[155,57.6],[157.5,57.7],[159.2,59.4],[160.1,61.7],[160.4,64.2],[160.4,66.7],[159.8,69.1],[158.9,71.4],[157.9,73.7],[156.8,75.9],[155.6,78.1],[154.4,80.2],[153.1,82.4],[151.8,84.5],[150.4,86.5],[149,88.6],[147.6,90.6],[146.1,92.6],[144.6,94.5],[143,96.5],[141.3,98.3],[139.7,100.2],[137.9,101.9],[136.1,103.7],[134.3,105.3],[132.3,106.8],[130.3,108.3],[128.2,109.5],[125.9,110.6],[123.6,111.3]]]]},{"id":"st_d","letter":"Д","hint":"1/3 меры · писать сверху вниз","svg":"./assets/stenography/signs/steno-05-d.svg","png":"./assets/stenography/signs/steno-05-d.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Д"],"ambiguityNote":null,"templates":[[[[107.5,158.7],[109.9,158.6],[112.4,158.4],[114.8,158.1],[117.3,157.9],[119.8,157.8],[122.2,157.7],[124.7,158],[127.1,158.5],[129.3,159.6],[131.1,161.2],[132.3,163.3],[132.9,165.7],[133.1,168.2],[132.9,170.6],[132.1,173],[130.8,175],[129,176.7],[126.8,177.8],[124.4,178.5],[122,178.6],[119.5,178.3],[117.2,177.5],[115.5,175.8],[115,173.4],[115.3,170.9],[116.1,168.6],[117.2,166.4],[118.6,164.4],[120.2,162.5],[122,160.9],[124.1,159.5],[126.4,158.6],[128.8,158.3],[131.3,158.2],[133.8,158.1],[136.2,158.1],[138.7,158.1],[141.2,158.1],[143.6,158.1],[146.1,158],[148.5,157.7]]]]},{"id":"st_e","letter":"Е","hint":"полмеры · писать снизу вверх","svg":"./assets/stenography/signs/steno-06-e.svg","png":"./assets/stenography/signs/steno-06-e.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Е","Ё"],"ambiguityNote":"В изолированном алфавитном знаке Е и Ё совпадают.","templates":[[[[83.5,179],[85.6,177.8],[87.7,176.6],[89.8,175.3],[92,174.1],[94.1,172.9],[96.2,171.7],[98.3,170.5],[100.4,169.2],[102.6,168],[104.7,166.8],[106.8,165.6],[108.9,164.4],[111,163.1],[113.2,161.9],[115.3,160.7],[117.4,159.5],[119.5,158.3],[121.6,157.1],[123.8,155.8],[125.9,154.6],[128,153.4],[130.1,152.2],[132.2,151],[134.4,149.7],[136.5,148.5],[138.6,147.3],[140.7,146.1],[142.8,144.9],[145,143.6],[147.1,142.4],[149.2,141.2],[151.3,140],[153.4,138.8],[155.6,137.6],[157.7,136.3],[159.8,135.1],[161.9,133.9],[164,132.7],[166.2,131.5],[168.3,130.2],[170.4,129],[172.5,127.8]]]]},{"id":"st_zh","letter":"Ж","hint":"одна мера · писать сверху вниз","svg":"./assets/stenography/signs/steno-08-zh.svg","png":"./assets/stenography/signs/steno-08-zh.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Ж","Ф"],"ambiguityNote":"Знак общий — принимается любая буква из пары.","templates":[[[[118.5,126.1],[120.2,124.3],[121.9,122.5],[123.8,120.9],[125.7,119.3],[127.6,117.8],[129.6,116.4],[131.7,115],[133.9,113.8],[136.1,112.7],[138.4,111.8],[140.8,111.3],[143.3,111.3],[145.5,112.3],[146.8,114.3],[147.2,116.8],[147.1,119.2],[146.7,121.7],[146.2,124.1],[145.5,126.5],[144.8,128.8],[144,131.2],[143.1,133.5],[142.3,135.8],[141.3,138.1],[140.4,140.4],[139.4,142.6],[138.3,144.9],[137.3,147.1],[136.2,149.3],[135,151.5],[133.9,153.7],[132.7,155.9],[131.5,158],[130.2,160.1],[128.9,162.3],[127.6,164.3],[126.2,166.4],[124.8,168.4],[123.3,170.4],[121.8,172.3],[120.1,174.2],[118.4,175.9],[116.5,177.5],[114.4,178.8],[112,179],[110,177.5],[109.2,175.3],[109.4,172.8],[110.4,170.6],[111.7,168.5],[113.3,166.6],[115.1,164.9],[117,163.3],[119,161.9],[121.2,160.7],[123.4,159.6],[125.8,158.8],[128.2,158.4],[130.6,158.2]]]]},{"id":"st_z","letter":"З","hint":"1/3 меры · писать сверху вниз","svg":"./assets/stenography/signs/steno-09-z.svg","png":"./assets/stenography/signs/steno-09-z.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["З"],"ambiguityNote":null,"templates":[[[[106.6,177.8],[109.1,177.9],[111.5,178],[114,177.9],[116.4,177.5],[118.8,177],[121.1,176.1],[123.3,175.1],[125.4,173.7],[127.3,172.1],[129,170.3],[130.4,168.4],[131.7,166.3],[132.9,164.1],[133.8,161.8],[133.2,163.7],[132.5,166.1],[131.8,168.5],[131.3,170.9],[131,173.3],[131.2,175.7],[132.7,177.6],[135,178.3],[137.5,178.2],[139.9,177.8],[142.3,177.3],[144.7,176.6],[147,176],[149.4,175.3]]]]},{"id":"st_i","letter":"И","hint":"одна мера · писать снизу вверх","svg":"./assets/stenography/signs/steno-10-i.svg","png":"./assets/stenography/signs/steno-10-i.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["И"],"ambiguityNote":null,"templates":[[[[70.4,179.4],[72.6,178.1],[74.7,176.9],[76.8,175.6],[79,174.3],[81.1,173.1],[83.2,171.8],[85.4,170.5],[87.5,169.3],[89.6,168],[91.8,166.7],[93.9,165.5],[96,164.2],[98.2,163],[100.3,161.7],[102.4,160.4],[104.5,159.2],[106.7,157.9],[108.8,156.6],[110.9,155.4],[113.1,154.1],[115.2,152.8],[117.3,151.6],[119.5,150.3],[121.6,149.1],[123.7,147.8],[125.9,146.5],[128,145.3],[130.1,144],[132.3,142.7],[134.4,141.5],[136.5,140.2],[138.7,138.9],[140.8,137.7],[142.9,136.4],[145.1,135.2],[147.2,133.9],[149.3,132.6],[151.5,131.4],[153.6,130.1],[155.7,128.8],[157.8,127.6],[160,126.3],[162.1,125],[164.2,123.8],[166.4,122.5],[168.5,121.2],[170.6,120],[172.8,118.7],[174.9,117.5],[177,116.2],[179.2,114.9],[181.3,113.7],[183.4,112.4],[185.6,111.1]]]]},{"id":"st_j","letter":"Й","hint":"диакритика · писать короткий отдельный знак","svg":"./assets/stenography/signs/steno-11-y-kratkoe.svg","png":"./assets/stenography/signs/steno-11-y-kratkoe.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Й"],"ambiguityNote":null,"templates":[[[[123,78],[125.4,77.9],[127.8,78.2],[130.1,79],[132,80.5],[133.2,82.6],[133.5,84.9],[133.2,87.3],[132.4,89.6],[131.3,91.7],[129.9,93.8],[128.5,95.7],[126.9,97.5],[125.1,99.2],[123.2,100.6],[121.1,101.9],[119,103]]]]},{"id":"st_k","letter":"К","hint":"одна мера · писать сверху вниз","svg":"./assets/stenography/signs/steno-12-k.svg","png":"./assets/stenography/signs/steno-12-k.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["К","Х"],"ambiguityNote":"Знак общий — принимается любая буква из пары.","templates":[[[[109.7,179.4],[110.9,177.2],[112,175],[113.2,172.8],[114.4,170.6],[115.6,168.4],[116.8,166.2],[117.9,164],[119.1,161.8],[120.3,159.6],[121.5,157.4],[122.7,155.2],[123.9,153],[125,150.8],[126.2,148.6],[127.4,146.4],[128.6,144.2],[129.8,142],[131,139.8],[132.1,137.6],[133.3,135.4],[134.5,133.2],[135.7,131],[136.9,128.8],[138.1,126.5],[139.2,124.3],[140.4,122.1],[141.6,119.9],[142.8,117.7],[144,115.5],[145.1,113.3],[146.3,111.1]]]]},{"id":"st_l","letter":"Л","hint":"одна мера · писать сверху вниз","svg":"./assets/stenography/signs/steno-13-l.svg","png":"./assets/stenography/signs/steno-13-l.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Л"],"ambiguityNote":null,"templates":[[[[143.1,177],[140.6,177.2],[138.1,177.4],[135.6,177.6],[133.1,177.7],[130.6,177.7],[128.1,177.7],[125.6,177.5],[123.1,177.3],[120.7,177],[118.2,176.5],[115.8,175.9],[113.4,175.1],[111.2,174.1],[109,172.7],[107.2,171.1],[105.7,169.1],[104.7,166.8],[104.2,164.4],[104.1,161.9],[104.3,159.4],[104.9,157],[105.7,154.6],[106.6,152.3],[107.7,150.1],[108.9,147.9],[110.2,145.7],[111.6,143.7],[113,141.6],[114.5,139.6],[116.1,137.6],[117.6,135.7],[119.2,133.8],[120.8,131.9],[122.5,130],[124.1,128.1],[125.7,126.2],[127.4,124.3],[129.1,122.6],[131,120.9],[132.9,119.3],[134.8,117.7],[136.9,116.3],[139,115],[141.2,113.7],[143.4,112.7],[145.8,111.8],[148.2,111.2],[150.7,110.8],[153.1,110.8],[155.6,111.3],[157.8,112.5],[159.3,114.4],[160.1,116.8],[160.5,119.2],[160.5,121.7],[160.2,124.2],[159.8,126.7],[159.3,129.1],[158.6,131.5],[157.8,133.9],[157,136.3],[156,138.6],[155,140.8],[153.7,143],[152.4,145.1],[150.9,147.1],[149.5,149.1],[148,151.1],[146.5,153.1],[144.9,155.1],[143.4,157],[141.8,159],[140.2,160.9],[138.6,162.8],[136.9,164.7],[135.3,166.5],[133.6,168.4],[131.7,170],[129.6,171.4],[127.4,172.5],[125.1,173.5],[122.7,174.3],[120.3,175],[117.9,175.6],[115.5,176.1],[113,176.5],[110.5,176.8],[108.1,177.1],[105.6,177.3],[103.1,177.4],[100.6,177.5],[98.1,177.5],[95.6,177.4],[93.1,177.3],[90.6,177.2]]]]},{"id":"st_m","letter":"М","hint":"одна мера · писать сверху вниз","svg":"./assets/stenography/signs/steno-14-m.svg","png":"./assets/stenography/signs/steno-14-m.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["М"],"ambiguityNote":null,"templates":[[[[137.5,163.6],[135.8,165.4],[134,167.1],[132.2,168.8],[130.3,170.4],[128.3,171.9],[126.2,173.3],[124.1,174.7],[122,175.9],[119.7,177],[117.4,177.9],[115,178.4],[112.5,178.3],[110.3,177.1],[109.1,175],[108.8,172.5],[108.9,170.1],[109.3,167.6],[109.9,165.2],[110.6,162.8],[111.4,160.4],[112.2,158],[113,155.7],[113.9,153.4],[114.9,151.1],[115.9,148.8],[116.9,146.5],[117.9,144.2],[119,142],[120.1,139.8],[121.3,137.5],[122.4,135.4],[123.6,133.2],[124.9,131],[126.2,128.9],[127.5,126.8],[128.8,124.7],[130.2,122.6],[131.7,120.6],[133.2,118.6],[134.8,116.7],[136.5,114.8],[138.3,113.1],[140.2,111.6],[142.5,110.6],[144.9,111],[146.4,113],[146.7,115.4],[146.1,117.8],[145.1,120.1],[143.8,122.2],[142.3,124.2],[140.7,126.1],[138.9,127.8],[137,129.5],[135,131],[132.9,132.3],[130.7,133.4],[128.4,134.4],[126,135],[123.5,135.2]]]]},{"id":"st_n","letter":"Н","hint":"1/3 меры · писать сверху вниз","svg":"./assets/stenography/signs/steno-15-n.svg","png":"./assets/stenography/signs/steno-15-n.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Н"],"ambiguityNote":null,"templates":[[[[105.7,178.2],[107.8,176.9],[109.9,175.5],[111.9,174],[113.9,172.6],[116.1,171.4],[118.4,170.7],[120.9,170.3],[123.4,170.5],[125.7,171.3],[127.8,172.6],[129.8,174.1],[131.7,175.6],[133.9,176.9],[136.3,177.5],[138.7,177.5],[141.1,176.9],[143.3,175.7],[145.3,174.2],[147.1,172.6],[148.8,170.7],[150.3,168.8]]]]},{"id":"st_o","letter":"О","hint":"полмеры · писать снизу вверх","svg":"./assets/stenography/signs/steno-16-o.svg","png":"./assets/stenography/signs/steno-16-o.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["О"],"ambiguityNote":null,"templates":[[[[144.1,169.4],[141.6,169.4],[139.2,169.4],[136.7,169.4],[134.2,169.4],[131.7,169.4],[129.2,169.4],[126.8,169.5],[124.3,169.5],[121.8,169.5],[119.3,169.5],[116.8,169.5],[114.4,169.5],[111.9,169.5]]]]},{"id":"st_p","letter":"П","hint":"одна мера · писать сверху вниз","svg":"./assets/stenography/signs/steno-17-p.svg","png":"./assets/stenography/signs/steno-17-p.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["П"],"ambiguityNote":null,"templates":[[[[148.3,111.5],[146.9,113.6],[145.6,115.7],[144.2,117.8],[142.9,119.9],[141.6,122],[140.2,124.1],[138.9,126.2],[137.5,128.3],[136.2,130.4],[134.9,132.5],[133.5,134.6],[132.2,136.6],[130.9,138.7],[129.5,140.8],[128.2,142.9],[126.8,145],[125.5,147.1],[124.2,149.2],[122.8,151.3],[121.5,153.4],[120.2,155.5],[118.9,157.7],[117.8,159.9],[116.7,162.1],[115.8,164.4],[115,166.7],[114.4,169.1],[114.1,171.6],[114.5,174.1],[115.8,176.1],[117.9,177.4],[120.3,178.1],[122.8,178.2],[125.2,177.9],[127.6,177.1],[129.8,175.9],[131.8,174.5],[133.7,172.9],[135.5,171.1],[137.2,169.3],[138.8,167.4],[140.3,165.4],[141.8,163.4]]]]},{"id":"st_r","letter":"Р","hint":"1/3 меры · писать сверху вниз","svg":"./assets/stenography/signs/steno-18-r.svg","png":"./assets/stenography/signs/steno-18-r.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Р"],"ambiguityNote":null,"templates":[[[[148.5,174.7],[146.1,174.8],[143.7,175.2],[141.3,175.6],[138.9,176],[136.4,176.4],[134,176.6],[131.6,176.7],[129.1,176.4],[126.8,175.6],[124.9,174.1],[123.7,172],[123.1,169.6],[122.8,167.2],[122.8,164.8],[123.2,162.4],[124.3,160.2],[126.1,158.6],[128.4,157.9],[130.9,157.9],[133.3,158.5],[135.5,159.4],[137.2,161.2],[137.9,163.5],[138,165.9],[137.5,168.3],[136.6,170.5],[135.3,172.6],[133.7,174.4],[131.7,175.9],[129.4,176.8],[127,177],[124.6,177.2],[122.1,177.2],[119.7,177.3],[117.2,177.3],[114.8,177.3],[112.3,177.3],[109.9,177.3],[107.5,177.6]]]]},{"id":"st_s","letter":"С","hint":"1/3 меры · писать сверху вниз","svg":"./assets/stenography/signs/steno-19-s.svg","png":"./assets/stenography/signs/steno-19-s.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["С"],"ambiguityNote":null,"templates":[[[[122.5,165.3],[121,167.2],[119.8,169.3],[119.3,171.6],[119.6,174],[120.9,176],[123,177.3],[125.3,177.8],[127.7,177.8],[130.1,177.2],[132.3,176.3],[134.4,175.1],[136.3,173.7],[138.1,172.1],[139.8,170.4],[141.4,168.5],[142.8,166.6],[144.2,164.6]]]]},{"id":"st_t","letter":"Т","hint":"1/3 меры · писать сверху вниз","svg":"./assets/stenography/signs/steno-20-t.svg","png":"./assets/stenography/signs/steno-20-t.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Т"],"ambiguityNote":null,"templates":[[[[133.5,180.1],[135,178.2],[136.2,176.1],[136.7,173.8],[136.4,171.4],[135.1,169.4],[133,168.1],[130.7,167.6],[128.3,167.6],[125.9,168.2],[123.7,169.1],[121.6,170.3],[119.7,171.7],[117.9,173.3],[116.2,175],[114.6,176.8],[113.2,178.8],[111.8,180.8]]]]},{"id":"st_u","letter":"У","hint":"две меры · писать снизу вверх","svg":"./assets/stenography/signs/steno-21-u.svg","png":"./assets/stenography/signs/steno-21-u.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["У"],"ambiguityNote":null,"templates":[[[[176.2,169.4],[173.7,169.4],[171.3,169.4],[168.8,169.4],[166.3,169.4],[163.8,169.4],[161.4,169.4],[158.9,169.4],[156.4,169.4],[154,169.4],[151.5,169.4],[149,169.4],[146.5,169.4],[144.1,169.4],[141.6,169.4],[139.1,169.4],[136.7,169.4],[134.2,169.4],[131.7,169.4],[129.2,169.4],[126.8,169.5],[124.3,169.5],[121.8,169.5],[119.3,169.5],[116.9,169.5],[114.4,169.5],[111.9,169.5],[109.5,169.5],[107,169.5],[104.5,169.5],[102,169.5],[99.6,169.5],[97.1,169.5],[94.6,169.5],[92.2,169.5],[89.7,169.5],[87.2,169.5],[84.7,169.5],[82.3,169.5],[79.8,169.5]]]]},{"id":"st_f","letter":"Ф","hint":"одна мера · писать сверху вниз","svg":"./assets/stenography/signs/steno-22-f.svg","png":"./assets/stenography/signs/steno-22-f.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Ф","Ж"],"ambiguityNote":"Знак общий — принимается любая буква из пары.","templates":[[[[118.5,126],[120.2,124.2],[121.9,122.5],[123.8,120.8],[125.7,119.2],[127.6,117.7],[129.6,116.3],[131.7,114.9],[133.9,113.7],[136.1,112.7],[138.4,111.8],[140.8,111.2],[143.3,111.2],[145.5,112.2],[146.8,114.3],[147.2,116.7],[147.1,119.2],[146.7,121.6],[146.2,124],[145.5,126.4],[144.8,128.8],[144,131.1],[143.1,133.4],[142.2,135.7],[141.3,138],[140.4,140.3],[139.4,142.6],[138.3,144.8],[137.3,147],[136.2,149.2],[135,151.4],[133.9,153.6],[132.7,155.8],[131.5,157.9],[130.2,160.1],[128.9,162.2],[127.6,164.3],[126.2,166.3],[124.8,168.3],[123.3,170.3],[121.8,172.3],[120.1,174.1],[118.4,175.9],[116.5,177.4],[114.4,178.7],[111.9,178.9],[110,177.5],[109.2,175.2],[109.4,172.8],[110.4,170.5],[111.7,168.4],[113.3,166.5],[115.1,164.8],[117,163.2],[119,161.8],[121.2,160.6],[123.4,159.6],[125.8,158.8],[128.2,158.3],[130.6,158.1]]]]},{"id":"st_h","letter":"Х","hint":"одна мера · писать сверху вниз","svg":"./assets/stenography/signs/steno-23-h.svg","png":"./assets/stenography/signs/steno-23-h.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Х","К"],"ambiguityNote":"Знак общий — принимается любая буква из пары.","templates":[[[[108.2,179.1],[109.2,176.8],[110.2,174.5],[111.2,172.2],[112.2,170],[113.2,167.7],[114.3,165.4],[115.3,163.1],[116.3,160.9],[117.3,158.6],[118.3,156.3],[119.3,154],[120.3,151.8],[121.3,149.5],[122.4,147.2],[123.4,144.9],[124.4,142.7],[125.4,140.4],[126.5,138.2],[127.7,136],[128.8,133.7],[130,131.5],[131.2,129.3],[132.3,127.2],[133.5,125],[134.8,122.8],[136,120.6],[137.3,118.5],[138.6,116.4],[140.1,114.4],[141.8,112.6],[144,111.4],[146.4,111.4],[147.6,113.5],[147.8,116],[147.1,118.4],[146,120.6],[144.8,122.8],[143.5,124.9],[142,126.9],[140.5,128.9],[139,130.8],[137.3,132.7],[135.6,134.5],[133.8,136.2],[131.9,137.8],[129.8,139.2],[127.6,140.4],[125.3,141.2]]]]},{"id":"st_c","letter":"Ц","hint":"две меры · писать сверху вниз","svg":"./assets/stenography/signs/steno-24-ts.svg","png":"./assets/stenography/signs/steno-24-ts.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Ц"],"ambiguityNote":"У Ц два позиционных начертания: начальное и конечное.","templates":[[[[150.7,142.7],[153.1,142],[155.3,140.9],[157.4,139.5],[159.3,138],[161.2,136.4],[163,134.6],[164.7,132.8],[166.3,130.9],[167.8,128.9],[169.3,126.9],[170.7,124.9],[172,122.7],[173.1,120.5],[174.1,118.3],[174.5,115.8],[174.2,113.4],[172.8,111.4],[170.3,111.3],[168.2,112.6],[166.4,114.3],[164.8,116.2],[163.4,118.3],[162.1,120.4],[160.9,122.5],[159.7,124.7],[158.4,126.9],[157.2,129],[156.1,131.2],[154.9,133.4],[153.7,135.6],[152.6,137.8],[151.4,140],[150.3,142.2],[149.2,144.5],[148.1,146.7],[147,148.9],[145.9,151.2],[144.8,153.4],[143.7,155.6],[142.6,157.9],[141.5,160.1],[140.4,162.3],[139.3,164.6],[138.2,166.8],[137.1,169],[136,171.3],[135,173.5],[133.9,175.7],[132.8,178],[131.7,180.2],[130.6,182.5],[129.5,184.7],[128.4,186.9],[127.3,189.2],[126.2,191.4],[125.1,193.6],[124,195.9],[122.9,198.1],[121.8,200.3],[120.7,202.6],[119.6,204.8],[118.5,207],[117.5,209.3],[116.4,211.5],[115.3,213.7],[114.2,216],[113.1,218.2],[112,220.4],[110.9,222.7],[109.8,224.9],[108.7,227.1],[107.6,229.4],[106.5,231.6],[105.4,233.8],[103.9,235.8],[102,237.4],[99.9,238.8],[97.7,239.8],[95.3,240.4],[92.8,240.7],[90.3,240.6],[88,239.8],[85.9,238.5],[84.4,236.5],[83.7,234.1],[83.9,231.7],[84.5,229.2],[85.3,226.9],[86.3,224.6],[87.3,222.3],[88.4,220.1],[89.6,217.9],[90.9,215.8],[92.2,213.7],[93.5,211.6],[94.9,209.5],[96.3,207.5],[97.8,205.5],[99.3,203.5],[100.9,201.6],[102.5,199.7],[104.1,197.8],[105.8,196],[107.6,194.2],[109.4,192.5],[111.2,190.8],[113.2,189.3],[115.2,187.8],[117.2,186.4],[119.3,185.1],[121.5,183.9],[123.8,183],[126.2,182.2],[128.6,181.7],[131.1,181.5]]],[[[100.6,180],[102.7,178.8],[104.9,177.7],[107,176.5],[109.2,175.4],[111.3,174.2],[113.5,173.2],[115.8,172.1],[118,171.1],[120.3,170.2],[122.5,169.4],[124.9,168.6],[127.2,167.9],[129.6,167.4],[132,166.9],[134.4,166.7],[136.9,166.7],[139.3,167],[141.7,167.7],[143.8,168.8],[145.9,170.2],[147.7,171.8],[148.9,173.9],[148.3,176.1],[146.2,177.5],[143.9,178.1],[141.4,178.3],[139,178.1],[136.7,177.3],[134.5,176.2],[132.5,174.8],[130.6,173.4],[128.7,171.8],[126.9,170.1],[125.2,168.4],[123.5,166.6]]]]},{"id":"st_ch","letter":"Ч","hint":"две меры · писать сверху вниз","svg":"./assets/stenography/signs/steno-25-ch.svg","png":"./assets/stenography/signs/steno-25-ch.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Ч"],"ambiguityNote":null,"templates":[[[[142.9,155.1],[141.2,157],[139.4,158.7],[137.7,160.5],[135.8,162.2],[134,163.8],[132.1,165.4],[130.1,166.9],[128.1,168.4],[126.1,169.8],[124,171.2],[121.9,172.5],[119.8,173.8],[117.6,174.9],[115.3,176],[113,176.9],[110.6,177.6],[108.2,178.2],[105.7,178.3],[103.3,178],[101.1,177],[99.4,175.1],[98.5,172.8],[98.1,170.4],[98,167.9],[98.2,165.4],[98.5,163],[99.1,160.5],[99.6,158.1],[100.3,155.7],[101,153.4],[101.8,151],[102.5,148.6],[103.4,146.3],[104.2,143.9],[105.1,141.6],[106,139.3],[106.9,137],[107.9,134.7],[108.9,132.4],[109.9,130.2],[110.9,127.9],[111.9,125.6],[113,123.4],[114.1,121.2],[115.2,118.9],[116.3,116.7],[117.5,114.5],[118.6,112.3],[119.8,110.1],[121,108],[122.3,105.8],[123.5,103.7],[124.8,101.5],[126.1,99.4],[127.4,97.3],[128.7,95.2],[130.1,93.1],[131.5,91.1],[133,89.1],[134.4,87.1],[136,85.1],[137.5,83.2],[139.1,81.3],[140.8,79.4],[142.5,77.7],[144.4,76],[146.4,74.5],[148.5,73.2],[150.8,72.4],[153.3,72.5],[155.3,73.9],[156.7,75.9],[157.2,78.4],[157.1,80.8],[156.4,83.2],[155.5,85.5],[154.4,87.8],[153.1,89.9],[151.7,91.9],[150.2,93.9],[148.6,95.8],[146.9,97.6],[145.1,99.3],[143.2,100.9],[141.3,102.5],[139.3,104],[137.2,105.4],[135.1,106.6],[132.9,107.8],[130.6,108.8],[128.3,109.7],[125.9,110.3],[123.4,110.7],[121,110.8]]]]},{"id":"st_sh","letter":"Ш","hint":"одна мера · писать сверху вниз","svg":"./assets/stenography/signs/steno-26-sh.svg","png":"./assets/stenography/signs/steno-26-sh.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Ш"],"ambiguityNote":null,"templates":[[[[155.5,110.7],[153,110.9],[150.5,111.3],[148.1,111.8],[145.7,112.6],[143.4,113.5],[141.1,114.5],[138.9,115.6],[136.8,116.9],[134.7,118.2],[132.7,119.7],[130.7,121.2],[128.8,122.8],[127,124.5],[125.2,126.3],[123.5,128.1],[121.9,130.1],[120.4,132],[119,134.1],[119.6,136.4],[121.3,138.1],[123.2,139.8],[125,141.5],[126.5,143.5],[127.6,145.7],[128,148.1],[128.2,150.6],[128.2,153.1],[127.9,155.6],[127.3,158],[126.5,160.4],[125.3,162.6],[124.1,164.7],[122.7,166.8],[121.3,168.9],[119.8,170.9],[118.3,172.8],[116.6,174.7],[114.7,176.3],[112.6,177.6],[110.2,178.2],[107.9,177.5],[106.1,175.7],[105.1,173.5],[105.5,171],[106.8,168.9],[108.6,167.2],[110.7,165.8],[112.8,164.5],[115.1,163.4],[117.4,162.5],[119.7,161.6],[122.1,160.9],[124.5,160.2],[126.9,159.7],[129.4,159.3],[131.9,159.1]]]]},{"id":"st_shch","letter":"Щ","hint":"одна мера · писать сверху вниз","svg":"./assets/stenography/signs/steno-27-shch.svg","png":"./assets/stenography/signs/steno-27-shch.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Щ"],"ambiguityNote":null,"templates":[[[[113,111],[115.4,110.8],[117.9,110.6],[120.4,110.4],[122.9,110.3],[125.4,110.3],[127.9,110.3],[130.4,110.5],[132.9,110.7],[135.3,111],[137.8,111.5],[140.2,112.1],[142.6,112.9],[144.8,113.9],[147,115.2],[148.8,116.9],[150.3,118.9],[151.3,121.2],[151.8,123.6],[151.9,126.1],[151.7,128.6],[151.1,131],[150.3,133.4],[149.4,135.7],[148.3,137.9],[147.1,140.1],[145.8,142.2],[144.4,144.3],[143,146.4],[141.5,148.4],[139.9,150.4],[138.4,152.3],[136.8,154.2],[135.2,156.1],[133.5,158],[131.9,159.9],[130.3,161.8],[128.6,163.7],[126.9,165.4],[125,167.1],[123.1,168.7],[121.2,170.3],[119.1,171.7],[117,173],[114.8,174.2],[112.6,175.3],[110.2,176.2],[107.8,176.8],[105.3,177.2],[102.9,177.1],[100.4,176.7],[98.2,175.5],[96.7,173.6],[95.9,171.2],[95.5,168.7],[95.5,166.2],[95.8,163.8],[96.2,161.3],[96.7,158.9],[97.4,156.5],[98.2,154.1],[99,151.7],[100,149.4],[101,147.2],[102.3,145],[103.6,142.9],[105.1,140.9],[106.5,138.8],[108,136.8],[109.5,134.9],[111.1,132.9],[112.6,131],[114.2,129],[115.8,127.1],[117.4,125.2],[119.1,123.3],[120.7,121.5],[122.4,119.6],[124.3,118],[126.4,116.6],[128.6,115.5],[130.9,114.5],[133.3,113.7],[135.7,113],[138.1,112.4],[140.5,111.9],[143,111.5],[145.5,111.2],[147.9,110.9],[150.4,110.7],[152.9,110.6],[155.4,110.5],[157.9,110.5],[160.4,110.5],[162.9,110.7],[165.4,110.8]]]]},{"id":"st_hard","letter":"Ъ","hint":"диакритика · писать короткий отдельный знак","svg":"./assets/stenography/signs/steno-28-hard.svg","png":"./assets/stenography/signs/steno-28-hard.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Ъ","Ь"],"ambiguityNote":"В ГЕСС мягкий и твёрдый знаки передаются одной надстрочной точкой и различаются по контексту.","templates":[[[[128,89],[128.2,89.2]]]]},{"id":"st_y","letter":"Ы","hint":"одна мера · писать снизу вверх","svg":"./assets/stenography/signs/steno-29-y.svg","png":"./assets/stenography/signs/steno-29-y.png","strokeCount":2,"loopCount":0,"reverseAcceptedLetters":["Ы"],"ambiguityNote":null,"templates":[[[[70.4,179.4],[72.6,178.1],[74.7,176.9],[76.8,175.6],[79,174.3],[81.1,173.1],[83.2,171.8],[85.4,170.5],[87.5,169.3],[89.6,168],[91.8,166.7],[93.9,165.5],[96,164.2],[98.2,163],[100.3,161.7],[102.4,160.4],[104.5,159.2],[106.7,157.9],[108.8,156.6],[110.9,155.4],[113.1,154.1],[115.2,152.8],[117.3,151.6],[119.5,150.3],[121.6,149.1],[123.7,147.8],[125.9,146.5],[128,145.3],[130.1,144],[132.3,142.7],[134.4,141.5],[136.5,140.2],[138.7,138.9],[140.8,137.7],[142.9,136.4],[145.1,135.2],[147.2,133.9],[149.3,132.6],[151.5,131.4],[153.6,130.1],[155.7,128.8],[157.8,127.6],[160,126.3],[162.1,125],[164.2,123.8],[166.4,122.5],[168.5,121.2],[170.6,120],[172.8,118.7],[174.9,117.5],[177,116.2],[179.2,114.9],[181.3,113.7],[183.4,112.4],[185.6,111.1]],[[143,211],[144,208.9],[145,206.8],[146,204.7],[147,202.6],[148,200.5],[149,198.4],[150,196.3],[151,194.2],[152,192.1],[153,190]]]]},{"id":"st_soft","letter":"Ь","hint":"диакритика · писать короткий отдельный знак","svg":"./assets/stenography/signs/steno-30-soft.svg","png":"./assets/stenography/signs/steno-30-soft.png","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Ь","Ъ"],"ambiguityNote":"В ГЕСС мягкий и твёрдый знаки передаются одной надстрочной точкой и различаются по контексту.","templates":[[[[128,89],[128.2,89.2]]]]},{"id":"st_eh","letter":"Э","hint":"полмеры · писать снизу вверх","svg":"./assets/stenography/signs/steno-31-eh.svg","png":"./assets/stenography/signs/steno-31-eh.png","strokeCount":2,"loopCount":0,"reverseAcceptedLetters":["Э"],"ambiguityNote":null,"templates":[[[[83.5,179],[85.6,177.8],[87.7,176.6],[89.8,175.3],[92,174.1],[94.1,172.9],[96.2,171.7],[98.3,170.5],[100.4,169.2],[102.6,168],[104.7,166.8],[106.8,165.6],[108.9,164.4],[111,163.1],[113.2,161.9],[115.3,160.7],[117.4,159.5],[119.5,158.3],[121.6,157.1],[123.8,155.8],[125.9,154.6],[128,153.4],[130.1,152.2],[132.2,151],[134.4,149.7],[136.5,148.5],[138.6,147.3],[140.7,146.1],[142.8,144.9],[145,143.6],[147.1,142.4],[149.2,141.2],[151.3,140],[153.4,138.8],[155.6,137.6],[157.7,136.3],[159.8,135.1],[161.9,133.9],[164,132.7],[166.2,131.5],[168.3,130.2],[170.4,129],[172.5,127.8]],[[143,211],[144,208.9],[145,206.8],[146,204.7],[147,202.6],[148,200.5],[149,198.4],[150,196.3],[151,194.2],[152,192.1],[153,190]]]]},{"id":"st_yu","letter":"Ю","hint":"две меры · писать снизу вверх","svg":"./assets/stenography/signs/steno-32-yu.svg","png":"./assets/stenography/signs/steno-32-yu.png","strokeCount":2,"loopCount":0,"reverseAcceptedLetters":["Ю"],"ambiguityNote":null,"templates":[[[[176.2,169.4],[173.7,169.4],[171.3,169.4],[168.8,169.4],[166.3,169.4],[163.8,169.4],[161.4,169.4],[158.9,169.4],[156.4,169.4],[154,169.4],[151.5,169.4],[149,169.4],[146.5,169.4],[144.1,169.4],[141.6,169.4],[139.1,169.4],[136.7,169.4],[134.2,169.4],[131.7,169.4],[129.2,169.4],[126.8,169.5],[124.3,169.5],[121.8,169.5],[119.3,169.5],[116.9,169.5],[114.4,169.5],[111.9,169.5],[109.5,169.5],[107,169.5],[104.5,169.5],[102,169.5],[99.6,169.5],[97.1,169.5],[94.6,169.5],[92.2,169.5],[89.7,169.5],[87.2,169.5],[84.7,169.5],[82.3,169.5],[79.8,169.5]],[[143,211],[144,208.9],[145,206.8],[146,204.7],[147,202.6],[148,200.5],[149,198.4],[150,196.3],[151,194.2],[152,192.1],[153,190]]]]},{"id":"st_ya","letter":"Я","hint":"две меры · писать снизу вверх","svg":"./assets/stenography/signs/steno-33-ya.svg","png":"./assets/stenography/signs/steno-33-ya.png","strokeCount":2,"loopCount":0,"reverseAcceptedLetters":["Я"],"ambiguityNote":null,"templates":[[[[195,109.7],[193,111.2],[191,112.6],[189,114.1],[187,115.6],[185,117],[183,118.5],[181,120],[179,121.5],[177,122.9],[175,124.4],[173,125.9],[171,127.3],[169,128.8],[167,130.3],[165,131.8],[163,133.2],[161,134.7],[159,136.2],[157,137.6],[155,139.1],[153,140.6],[151,142.1],[149,143.5],[147,145],[145,146.5],[143,147.9],[141,149.4],[139,150.9],[137,152.4],[135,153.8],[133,155.3],[131,156.8],[129,158.2],[127,159.7],[125,161.2],[123,162.7],[121,164.1],[119,165.6],[117,167.1],[115,168.5],[113,170],[111,171.5],[109,173],[107,174.4],[105,175.9],[103,177.4],[101,178.8],[99,180.3],[97,181.8],[95,183.2],[93,184.7],[91,186.2],[89,187.7],[87,189.1],[85,190.6],[83,192.1],[81,193.5],[79,195],[77,196.5],[75,198],[73,199.4],[71,200.9],[69,202.4],[67,203.8],[65,205.3],[63,206.8],[61,208.3]],[[143,211],[144,208.9],[145,206.8],[146,204.7],[147,202.6],[148,200.5],[149,198.4],[150,196.3],[151,194.2],[152,192.1],[153,190]]]]}]}/*STENO-BUILTIN-END*/;
var STENO_AKOPYAN_BUILTIN=/*STENO-AKOPYAN-BUILTIN-START*/{"schemaVersion":1,"contentVersion":3,"language":"ru","system":"akopyan","updatedAt":"2026-10-16","space":{"size":256,"controlY":80,"baselineY":176},"sourceNote":"О. С. Акопьян. Согласные и гласные знаки по учебным схемам q6/q3; Й, Я, Ъ/Ь дополнены по правилам письма.","cards":[{"id":"st_b","letter":"Б","hint":"Б начинается от основной линии: вверх, влево и к началу.","svg":"./assets/stenography/akopyan/ak_b.svg","png":"./assets/stenography/akopyan/ak_b.png","grading":"cloud","strokeCount":4,"loopCount":0,"reverseAcceptedLetters":["Б"],"ambiguityNote":null,"templates":[[[[123.0,161.0],[123.3,158.0],[123.8,155.1],[124.6,152.2],[125.8,149.5],[127.4,147.0],[129.1,144.6],[130.9,142.2],[132.9,140.1],[134.9,137.9],[136.8,135.5],[138.6,133.2],[140.5,130.9],[142.4,128.6],[144.2,126.2],[145.7,123.7],[147.4,121.2],[149.0,118.7],[150.5,116.1],[151.9,113.5],[153.3,110.9],[154.8,108.3],[156.6,105.9],[158.3,103.5],[159.8,100.9],[160.9,98.2],[161.9,95.4],[162.6,92.5],[163.2,89.6],[163.7,86.6],[163.6,83.7],[162.2,81.1],[159.8,79.3],[156.9,78.5],[154.0,78.5],[151.1,79.3],[148.4,80.6],[146.1,82.4],[144.1,84.6],[142.3,86.9],[140.3,89.2],[138.2,91.3],[136.2,93.5],[134.4,95.8],[132.8,98.4],[131.3,100.9],[129.9,103.5],[128.3,106.1],[126.6,108.5],[124.7,110.8],[122.6,112.9],[120.5,115.0],[118.5,117.2],[116.6,119.5],[115.0,122.0],[113.3,124.5],[111.5,126.8],[109.6,129.1],[107.7,131.4],[106.0,133.9],[104.4,136.3],[102.6,138.7],[100.6,141.0],[98.8,143.3],[97.2,145.8],[95.9,148.4],[94.9,151.2],[94.4,154.2],[94.7,157.1],[95.9,159.9],[97.8,162.1],[100.2,163.8],[103.1,164.6],[106.0,164.9],[109.0,165.0]],[[123.0,161.0],[120.2,161.8],[117.5,163.0],[114.8,164.1],[111.9,164.8],[109.0,165.0]],[[123.0,161.0],[125.7,161.7],[128.5,161.9],[131.2,162.0],[134.0,162.0]],[[109.0,165.0],[108.6,168.0],[108.0,170.9],[107.2,173.8],[105.9,176.4],[104.1,178.9],[102.0,181.0]]]]},{"id":"st_v","letter":"В","hint":"В — маленькая петля с ровной спинкой и узким закруглением.","svg":"./assets/stenography/akopyan/ak_v.svg","png":"./assets/stenography/akopyan/ak_v.png","grading":"cloud","strokeCount":6,"loopCount":0,"reverseAcceptedLetters":["В"],"ambiguityNote":null,"templates":[[[[161.0,82.0],[159.1,79.9],[156.5,79.0],[153.7,79.3],[151.1,80.3],[148.7,81.7],[146.6,83.6],[144.8,85.8],[143.1,88.1],[141.6,90.4],[140.2,92.9],[139.1,95.5],[138.4,98.2],[138.0,101.0]],[[161.0,82.0],[162.0,82.0],[163.0,82.0]],[[161.0,82.0],[160.2,84.8],[159.0,87.5],[157.6,90.0],[155.9,92.4],[153.9,94.5],[151.6,96.2],[149.1,97.7],[146.5,99.0],[143.7,100.0],[140.9,100.7],[138.0,101.0]],[[138.0,101.0],[135.6,102.6],[133.4,104.7],[131.4,106.8],[129.3,109.0],[127.4,111.2],[125.5,113.5],[123.8,115.9],[122.2,118.4],[120.5,120.8],[118.8,123.2],[117.0,125.5],[115.3,128.0],[113.7,130.4],[112.0,132.9],[110.3,135.3],[108.6,137.8],[106.9,140.2],[105.2,142.6],[103.6,145.0],[102.2,147.7],[101.0,150.4],[100.2,153.2],[99.5,156.1],[99.0,159.0]],[[120.0,154.0],[118.7,156.7],[116.4,158.5],[113.7,159.9],[111.1,161.3],[108.4,162.6],[105.5,163.4],[102.6,163.3],[100.1,161.8],[99.0,159.0]],[[99.0,159.0],[97.0,159.2],[95.0,159.5],[93.0,160.0]]]]},{"id":"st_g","letter":"Г","hint":"Г: рукописная форма с узкими закруглениями и ровной спинкой.","svg":"./assets/stenography/akopyan/ak_g.svg","png":"./assets/stenography/akopyan/ak_g.png","grading":"cloud","strokeCount":3,"loopCount":0,"reverseAcceptedLetters":["Г"],"ambiguityNote":null,"templates":[[[[152.0,76.0],[152.0,78.5],[152.0,81.0]],[[152.0,81.0],[149.4,81.1],[146.8,81.7],[144.4,82.8],[142.3,84.4],[140.3,86.2],[138.4,88.0],[136.3,89.7],[134.0,91.0]],[[152.0,81.0],[154.8,81.9],[156.5,84.1],[156.6,87.1],[156.0,89.9],[155.0,92.7],[153.6,95.3],[151.8,97.6],[149.8,99.7],[147.7,101.8],[145.6,103.9],[143.6,105.9],[141.6,108.1],[139.7,110.4],[138.1,112.8],[136.5,115.2],[134.7,117.6],[132.7,119.7],[130.6,121.8],[128.4,123.7],[126.1,125.6],[123.9,127.5],[122.0,129.8],[120.2,132.0],[118.2,134.3],[116.3,136.4],[114.4,138.7],[112.6,141.0],[110.9,143.4],[109.2,145.8],[107.5,148.2],[105.9,150.6],[104.4,153.2],[103.3,155.9],[102.4,158.7],[102.3,161.6],[103.7,164.1],[106.5,165.1],[109.4,165.2],[112.3,164.8],[115.1,164.0],[117.8,162.8],[120.3,161.3],[122.9,159.8],[125.4,158.4],[128.0,157.0]]]]},{"id":"st_d","letter":"Д","hint":"Д — прямой начальный штрих и маленькая узкая петля.","svg":"./assets/stenography/akopyan/ak_d.svg","png":"./assets/stenography/akopyan/ak_d.png","grading":"cloud","strokeCount":4,"loopCount":0,"reverseAcceptedLetters":["Д"],"ambiguityNote":null,"templates":[[[[168.0,76.0],[168.0,78.0],[168.0,80.0]],[[171.0,79.0],[169.7,80.0],[168.0,80.0]],[[168.0,80.0],[165.5,81.5],[163.4,83.7],[161.8,86.2],[160.2,88.8],[158.6,91.2],[156.7,93.6],[154.7,95.8],[152.6,97.9],[150.7,100.1],[148.9,102.5],[147.3,105.1],[145.6,107.5],[143.9,110.0],[142.3,112.5],[140.7,115.0],[138.9,117.4],[136.9,119.6],[135.0,121.9],[133.4,124.4],[131.8,127.0],[130.3,129.5],[128.6,132.0],[126.8,134.4],[125.0,136.7],[123.1,139.0],[121.0,141.1],[118.7,143.0],[116.3,144.8],[113.9,146.5],[111.4,148.2],[109.0,150.0]],[[107.1,150.8],[104.5,149.5],[101.5,149.5],[98.6,150.0],[95.9,151.0],[93.5,152.7],[91.7,155.0],[90.7,157.8],[90.6,160.7],[91.8,163.4],[94.3,164.8],[97.2,165.2],[100.1,164.7],[102.8,163.6],[105.0,161.7],[106.5,159.2],[107.5,156.4],[108.0,153.5],[107.1,150.8]]]]},{"id":"st_zh","letter":"Ж","hint":"Ж: закругление, ровная спинка и невысокая петля.","svg":"./assets/stenography/akopyan/ak_zh.svg","png":"./assets/stenography/akopyan/ak_zh.png","grading":"cloud","strokeCount":8,"loopCount":0,"reverseAcceptedLetters":["Ж"],"ambiguityNote":null,"templates":[[[[158.0,76.0],[158.0,78.5],[158.0,81.0]],[[158.0,81.0],[155.0,81.1],[152.1,81.6],[149.2,82.6],[146.6,84.0],[144.2,85.7],[141.9,87.6],[139.6,89.5],[137.0,91.0]],[[158.0,81.0],[160.5,81.3],[163.0,82.0]],[[163.0,82.0],[164.0,82.0],[165.0,82.0]],[[163.0,82.0],[162.4,84.9],[161.8,87.8],[160.9,90.6],[159.9,93.4],[158.7,96.1],[157.4,98.8],[155.9,101.4],[154.4,103.9],[152.7,106.3],[151.1,108.8],[149.5,111.3],[148.0,113.9],[146.6,116.5],[145.0,119.0],[143.3,121.4],[141.7,123.9],[140.2,126.4],[138.7,129.0],[137.1,131.5],[135.5,134.0],[133.9,136.5],[132.0,138.7],[129.9,140.8],[127.7,142.9],[125.4,144.7],[122.8,146.1],[120.0,147.0]],[[120.0,147.0],[117.2,146.5],[114.3,146.6],[111.5,146.9],[108.7,147.4],[105.9,148.2],[103.4,149.5],[101.0,151.1],[99.4,153.5],[98.6,156.2],[98.0,159.0]],[[120.0,147.0],[119.5,149.9],[118.7,152.7],[117.6,155.4],[115.9,157.8],[113.8,159.9],[111.6,161.8],[109.1,163.3],[106.4,164.3],[103.4,164.6],[100.6,163.9],[98.6,161.9],[98.0,159.0]],[[98.0,159.0],[96.0,159.2],[94.0,159.5],[92.0,160.0]]]]},{"id":"st_z","letter":"З","hint":"З — S-образная основа с петлёй снизу.","svg":"./assets/stenography/akopyan/ak_z.svg","png":"./assets/stenography/akopyan/ak_z.png","grading":"cloud","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["З"],"ambiguityNote":null,"templates":[[[[163.0,81.0],[160.2,82.1],[157.9,83.9],[155.7,85.9],[153.6,88.0],[151.3,89.9],[149.0,91.8],[146.9,93.9],[145.1,96.3],[143.6,98.8],[142.4,101.5],[141.3,104.3],[140.4,107.1],[139.5,110.0],[138.7,112.8],[138.1,115.7],[137.7,118.7],[137.0,121.6],[135.9,124.4],[134.9,127.1],[133.8,129.9],[132.6,132.6],[131.2,135.3],[129.6,137.8],[127.7,140.1],[125.6,142.1],[123.2,143.9],[120.7,145.4],[118.0,146.8],[115.4,148.3],[113.2,150.2],[111.0,152.2],[108.7,154.1],[106.4,156.0],[104.2,158.0],[102.5,160.4],[101.0,163.0]]]]},{"id":"st_k","letter":"К","hint":"К — наклонная прямая, начало и конец острые.","svg":"./assets/stenography/akopyan/ak_k.svg","png":"./assets/stenography/akopyan/ak_k.png","grading":"cloud","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["К"],"ambiguityNote":null,"templates":[[[[157.0,84.0],[155.5,86.6],[153.9,89.1],[152.2,91.5],[150.6,94.0],[149.0,96.5],[147.2,98.9],[145.3,101.2],[143.4,103.5],[141.7,105.9],[140.1,108.5],[138.7,111.1],[137.2,113.7],[135.6,116.2],[133.8,118.6],[131.8,120.8],[129.9,123.1],[128.1,125.4],[126.3,127.8],[124.6,130.3],[122.7,132.6],[120.7,134.8],[118.9,137.2],[117.2,139.6],[115.6,142.1],[113.8,144.5],[112.0,146.9],[110.2,149.3],[108.5,151.7],[106.8,154.2],[105.2,156.7],[103.6,159.2],[102.1,161.7],[100.3,164.2],[98.0,166.0]]]]},{"id":"st_l","letter":"Л","hint":"Л пишется движением влево, как начальная часть рукописной Л.","svg":"./assets/stenography/akopyan/ak_l.svg","png":"./assets/stenography/akopyan/ak_l.png","grading":"cloud","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Л"],"ambiguityNote":null,"templates":[[[[147.0,166.0],[144.1,166.7],[141.2,166.9],[138.3,166.7],[135.3,166.4],[132.4,166.3],[129.6,167.1],[126.9,168.4],[124.2,169.5],[121.4,170.4],[118.5,171.1],[115.7,171.8],[113.0,173.0]]]]},{"id":"st_m","letter":"М","hint":"М начинается остро и заканчивается закруглением.","svg":"./assets/stenography/akopyan/ak_m.svg","png":"./assets/stenography/akopyan/ak_m.png","grading":"cloud","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["М"],"ambiguityNote":null,"templates":[[[[155.0,79.0],[153.7,81.6],[151.8,83.8],[149.8,86.0],[148.1,88.3],[146.6,90.8],[145.1,93.4],[143.7,95.9],[142.2,98.5],[140.9,101.1],[139.4,103.6],[137.9,106.1],[136.4,108.6],[134.9,111.2],[133.5,113.7],[132.0,116.2],[130.5,118.8],[129.0,121.3],[127.5,123.8],[125.9,126.3],[124.2,128.6],[122.4,131.0],[120.7,133.3],[119.1,135.8],[117.6,138.3],[116.1,140.8],[114.6,143.3],[113.0,145.8],[111.4,148.3],[110.1,150.9],[109.0,153.6],[108.4,156.5],[108.3,159.4],[109.1,162.2],[111.2,164.1],[114.0,164.8],[116.9,164.9],[119.9,164.9],[122.8,164.4],[125.6,163.6],[128.2,162.3],[130.8,160.9],[133.0,159.0]]]]},{"id":"st_n","letter":"Н","hint":"Н — короткая волнистая линия, начинающаяся от основной линии.","svg":"./assets/stenography/akopyan/ak_n.svg","png":"./assets/stenography/akopyan/ak_n.png","grading":"cloud","strokeCount":3,"loopCount":0,"reverseAcceptedLetters":["Н"],"ambiguityNote":null,"templates":[[[[121.0,159.0],[120.0,160.3],[120.0,162.0]],[[151.0,159.0],[149.5,161.3],[147.4,163.3],[144.9,164.4],[142.1,164.8],[139.3,164.9],[136.5,164.8],[133.7,164.4],[131.0,163.7],[128.3,162.8],[125.6,162.3],[122.8,162.0],[120.0,162.0]],[[120.0,162.0],[117.4,162.3],[114.9,162.9],[112.5,163.9],[110.3,165.2],[108.4,166.8],[107.0,169.0]]]]},{"id":"st_p","letter":"П","hint":"П начинается закруглением и заканчивается наклонной прямой.","svg":"./assets/stenography/akopyan/ak_p.svg","png":"./assets/stenography/akopyan/ak_p.png","grading":"cloud","strokeCount":3,"loopCount":0,"reverseAcceptedLetters":["П"],"ambiguityNote":null,"templates":[[[[122.0,97.0],[124.1,94.9],[125.9,92.6],[127.9,90.4],[130.3,88.7],[132.9,87.3],[135.5,85.8],[138.0,84.2],[140.5,82.7],[143.3,81.7],[146.2,81.4],[149.1,81.9],[151.8,83.1],[154.0,85.0],[155.2,87.7],[155.1,90.7],[154.3,93.5],[152.9,96.1],[151.3,98.6],[149.7,101.0],[148.1,103.6],[146.5,106.0],[144.9,108.5],[143.3,111.0],[141.6,113.4],[139.7,115.7],[137.8,118.0],[136.0,120.3],[134.5,122.9],[133.0,125.4],[131.6,128.0],[130.3,130.7],[128.9,133.3],[127.4,135.9],[125.8,138.3],[123.9,140.6],[122.0,142.8],[120.2,145.2],[118.6,147.7],[117.0,150.2],[115.4,152.7],[113.9,155.2],[112.4,157.8],[110.7,160.2],[108.9,162.5],[106.9,164.7],[105.0,167.0]],[[100.0,167.0],[102.5,167.0],[105.0,167.0]],[[105.0,167.0],[104.8,168.1],[104.0,169.0]]]]},{"id":"st_r","letter":"Р","hint":"Р — малый круглый знак; направление как у Б.","svg":"./assets/stenography/akopyan/ak_r.svg","png":"./assets/stenography/akopyan/ak_r.png","grading":"cloud","strokeCount":6,"loopCount":0,"reverseAcceptedLetters":["Р"],"ambiguityNote":null,"templates":[[[[123.0,159.0],[123.6,156.2],[124.4,153.5],[126.0,151.2],[128.4,149.7],[131.0,148.6],[133.8,147.9],[136.6,147.5],[139.3,148.1],[141.2,150.2],[142.1,152.8],[142.7,155.6],[143.3,158.4],[143.8,161.2],[144.0,164.0]],[[123.0,159.0],[121.0,159.2],[119.0,159.5],[117.0,160.0]],[[123.0,159.0],[123.0,161.3],[123.1,163.5],[123.4,165.8],[124.0,168.0]],[[144.0,164.0],[141.1,164.1],[138.2,164.4],[135.3,165.1],[132.5,165.9],[129.7,166.7],[126.8,167.3],[124.0,168.0]],[[144.0,164.0],[145.8,165.3],[147.8,166.0],[150.0,166.0]],[[124.0,168.0],[121.9,169.7],[119.7,171.3],[117.5,172.9],[115.1,174.3],[112.6,175.4],[110.0,176.0]]]]},{"id":"st_s","letter":"С","hint":"С — короткая наклонная черта с закруглённым концом.","svg":"./assets/stenography/akopyan/ak_s.svg","png":"./assets/stenography/akopyan/ak_s.png","grading":"cloud","strokeCount":5,"loopCount":0,"reverseAcceptedLetters":["С"],"ambiguityNote":null,"templates":[[[[115.0,156.0],[114.2,156.9],[114.0,158.0]],[[145.0,156.0],[142.6,157.5],[140.2,158.8],[137.8,160.1],[135.3,161.4],[132.9,162.8],[130.4,164.0],[127.8,164.7],[125.0,165.0]],[[109.0,158.0],[111.5,158.0],[114.0,158.0]],[[114.0,158.0],[114.3,160.5],[115.3,162.9],[117.4,164.3],[119.9,164.8],[122.4,165.0],[125.0,165.0]],[[125.0,165.0],[125.0,167.0],[125.0,169.0]]]]},{"id":"st_t","letter":"Т","hint":"Т — малый знак: закругление переходит в наклонный штрих.","svg":"./assets/stenography/akopyan/ak_t.svg","png":"./assets/stenography/akopyan/ak_t.png","grading":"cloud","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Т"],"ambiguityNote":null,"templates":[[[[143.0,167.0],[143.0,164.1],[142.4,161.2],[141.5,158.4],[139.5,156.3],[136.7,155.7],[133.7,155.9],[130.8,156.2],[128.0,156.9],[125.2,157.9],[122.5,159.2],[119.9,160.5],[117.4,162.0],[115.1,163.8],[112.8,165.6],[110.5,167.5],[108.0,169.0]]]]},{"id":"st_f","letter":"Ф","hint":"Ф начинается маленькой петлёй; S-образная спинка заканчивается петлёй.","svg":"./assets/stenography/akopyan/ak_f.svg","png":"./assets/stenography/akopyan/ak_f.png","grading":"cloud","strokeCount":8,"loopCount":0,"reverseAcceptedLetters":["Ф"],"ambiguityNote":null,"templates":[[[[158.0,87.0],[155.9,88.8],[153.9,90.7],[151.9,92.6],[149.9,94.6],[147.9,96.5],[145.9,98.4],[143.8,100.2],[141.7,102.0],[139.8,104.0],[138.1,106.2],[136.0,108.0]],[[136.0,108.0],[133.6,108.1],[131.3,108.5],[129.0,109.0]],[[136.0,108.0],[136.0,110.9],[135.8,113.7],[135.5,116.6],[134.7,119.3],[133.6,122.0],[132.3,124.5],[131.0,127.0],[129.9,129.7],[128.9,132.4],[127.8,135.0],[126.4,137.5],[124.6,139.8],[122.5,141.7],[120.0,143.0]],[[120.0,143.0],[117.2,143.4],[114.4,144.1],[111.7,145.0],[109.1,146.2],[106.7,147.6],[104.4,149.3],[102.3,151.3],[100.4,153.3],[98.7,155.6],[97.5,158.2],[97.0,161.0]],[[120.0,143.0],[119.7,145.9],[119.2,148.7],[118.5,151.5],[117.6,154.2],[116.4,156.8],[114.7,159.1],[112.5,161.0],[110.2,162.6],[107.6,163.9],[104.9,164.7],[102.0,165.0]],[[92.0,161.0],[94.5,161.0],[97.0,161.0]],[[97.0,161.0],[98.3,162.7],[100.0,164.1],[102.0,165.0]],[[102.0,165.0],[102.0,167.0],[102.0,169.0]]]]},{"id":"st_h","letter":"Х","hint":"Х — петля, которая заканчивается прямым штрихом.","svg":"./assets/stenography/akopyan/ak_h.svg","png":"./assets/stenography/akopyan/ak_h.png","grading":"cloud","strokeCount":2,"loopCount":0,"reverseAcceptedLetters":["Х"],"ambiguityNote":null,"templates":[[[[142.5,98.9],[142.1,96.0],[142.9,93.2],[144.1,90.4],[145.6,87.9],[147.6,85.6],[150.0,83.9],[152.7,82.6],[155.6,81.9],[158.5,82.0],[161.0,83.6],[162.2,86.3],[162.0,89.2],[160.8,91.9],[158.9,94.3],[156.6,96.2],[154.0,97.6],[151.2,98.5],[148.3,99.1],[145.3,99.6],[142.5,98.9]],[[141.0,101.0],[138.1,101.7],[135.6,103.3],[133.5,105.4],[131.5,107.5],[129.5,109.7],[127.7,112.0],[126.2,114.6],[124.8,117.2],[123.4,119.8],[121.8,122.3],[120.1,124.7],[118.5,127.2],[117.1,129.8],[115.7,132.4],[114.3,135.0],[112.7,137.5],[111.0,139.9],[109.4,142.4],[107.9,145.0],[106.6,147.6],[105.1,150.2],[103.5,152.7],[101.7,155.0],[99.9,157.4],[98.1,159.8],[96.1,162.0],[94.0,164.0],[91.7,165.9],[89.0,167.0]]]]},{"id":"st_c","letter":"Ц","hint":"Ц — петля с S-образной спинкой и острым концом.","svg":"./assets/stenography/akopyan/ak_c.svg","png":"./assets/stenography/akopyan/ak_c.png","grading":"cloud","strokeCount":6,"loopCount":0,"reverseAcceptedLetters":["Ц"],"ambiguityNote":null,"templates":[[[[152.0,76.0],[152.0,78.5],[152.0,81.0]],[[152.0,81.0],[149.4,82.1],[146.8,83.3],[144.5,84.9],[142.6,87.1],[141.4,89.6],[140.7,92.4],[140.3,95.2],[140.0,98.0]],[[152.0,81.0],[154.0,81.8],[155.7,83.2],[157.0,85.0]],[[163.0,84.0],[161.0,84.3],[159.0,84.6],[157.0,85.0]],[[157.0,85.0],[156.2,87.8],[154.9,90.3],[153.1,92.6],[150.9,94.4],[148.3,95.6],[145.5,96.5],[142.8,97.3],[140.0,98.0]],[[140.0,98.0],[139.2,100.8],[138.1,103.5],[136.9,106.2],[135.9,109.0],[135.3,111.8],[134.8,114.7],[134.3,117.6],[133.6,120.4],[132.7,123.2],[131.8,126.0],[130.9,128.8],[129.9,131.6],[129.0,134.3],[128.0,137.1],[126.7,139.8],[125.3,142.3],[123.7,144.8],[122.1,147.2],[120.4,149.6],[118.5,151.9],[116.5,154.0],[114.4,156.0],[112.3,158.0],[110.0,159.8],[107.6,161.5],[105.1,163.1],[102.6,164.6],[100.1,166.1],[97.6,167.6],[95.0,169.0]]]]},{"id":"st_ch","letter":"Ч","hint":"Ч — спинка изгибается влево и заканчивается закруглением.","svg":"./assets/stenography/akopyan/ak_ch.svg","png":"./assets/stenography/akopyan/ak_ch.png","grading":"cloud","strokeCount":3,"loopCount":0,"reverseAcceptedLetters":["Ч"],"ambiguityNote":null,"templates":[[[[167.0,84.0],[164.1,84.7],[161.3,85.8],[158.6,87.0],[155.9,88.3],[153.3,89.6],[150.8,91.2],[148.3,92.9],[145.8,94.5],[143.3,96.0],[140.8,97.7],[138.5,99.6],[136.5,101.8],[134.5,104.0],[132.5,106.2],[130.6,108.5],[128.9,110.9],[127.1,113.3],[125.3,115.7],[123.5,118.0],[121.7,120.4],[120.1,122.9],[118.5,125.4],[116.7,127.8],[114.9,130.1],[113.1,132.5],[111.6,135.1],[110.3,137.8],[109.3,140.6],[108.3,143.4],[107.4,146.2],[106.7,149.1],[106.4,152.1],[106.9,155.0],[108.0,157.7],[109.7,160.2],[112.0,162.0]],[[117.0,160.0],[114.5,161.1],[112.0,162.0]],[[112.0,162.0],[111.7,164.0],[111.0,166.0]]]]},{"id":"st_sh","letter":"Ш","hint":"Ш — одномерный S-образный знак.","svg":"./assets/stenography/akopyan/ak_sh.svg","png":"./assets/stenography/akopyan/ak_sh.png","grading":"cloud","strokeCount":2,"loopCount":0,"reverseAcceptedLetters":["Ш"],"ambiguityNote":null,"templates":[[[[88.0,84.0],[88.3,86.7],[89.8,89.1],[91.5,91.3],[92.0,94.0]],[[176.0,91.0],[175.3,93.9],[174.2,96.6],[172.8,99.2],[171.3,101.7],[169.6,104.1],[167.9,106.5],[166.4,109.0],[165.4,111.8],[164.8,114.7],[164.3,117.6],[163.6,120.5],[162.7,123.3],[161.7,126.1],[160.7,128.8],[159.3,131.4],[157.7,133.9],[156.1,136.4],[154.5,138.9],[152.9,141.3],[151.2,143.7],[149.6,146.2],[148.0,148.7],[146.2,151.0],[144.2,153.2],[142.2,155.3],[140.2,157.5],[138.4,159.8],[136.6,162.2],[134.7,164.4],[132.7,166.6],[131.0,169.0]]]]},{"id":"st_shch","letter":"Щ","hint":"Щ — малый S-образный знак, конечная часть рукописной Щ.","svg":"./assets/stenography/akopyan/ak_shch.svg","png":"./assets/stenography/akopyan/ak_shch.png","grading":"cloud","strokeCount":4,"loopCount":0,"reverseAcceptedLetters":["Щ"],"ambiguityNote":null,"templates":[[[[85.0,87.0],[82.9,87.4],[80.9,88.1],[79.0,89.0]],[[142.0,141.0],[139.2,141.7],[136.5,142.8],[134.0,144.3],[131.8,146.2],[129.8,148.3],[128.3,150.8],[127.1,153.4],[126.3,156.2],[125.7,159.0],[124.9,161.8],[123.4,164.3],[121.4,166.4],[119.0,168.0]],[[119.0,168.0],[117.5,168.5],[116.0,169.0]],[[119.0,168.0],[119.0,170.0],[119.0,172.0]]]]},{"id":"st_a","letter":"А","hint":"Прямая с большим наклоном — знак для А.","svg":"./assets/stenography/akopyan/ak_a.svg","png":"./assets/stenography/akopyan/ak_a.png","grading":"cloud","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["А"],"ambiguityNote":null,"templates":[[[[201.0,91.0],[198.3,92.3],[195.6,93.6],[193.0,94.9],[190.3,96.3],[187.7,97.6],[185.0,98.9],[182.3,100.2],[179.5,101.3],[176.8,102.4],[174.1,103.7],[171.6,105.3],[169.0,106.8],[166.4,108.2],[163.7,109.5],[161.0,110.8],[158.3,112.1],[155.7,113.4],[153.1,115.0],[150.7,116.6],[148.2,118.3],[145.6,119.8],[143.0,121.3],[140.4,122.7],[137.7,124.0],[135.1,125.3],[132.4,126.6],[129.7,127.9],[127.1,129.3],[124.6,131.0],[122.2,132.7],[119.6,134.3],[117.1,135.9],[114.7,137.6],[112.2,139.3],[109.7,140.8],[107.1,142.2],[104.5,143.7],[101.9,145.3],[99.5,147.0],[97.0,148.6],[94.5,150.2],[92.1,151.9],[89.7,153.8],[87.4,155.7],[85.0,157.4],[82.4,158.9],[79.9,160.4],[77.4,162.0],[74.9,163.7],[72.4,165.3],[69.9,167.0],[67.5,168.7],[65.1,170.5],[62.7,172.3],[60.3,173.9],[57.9,175.7],[56.0,178.0]]]]},{"id":"st_ya","letter":"Я","hint":"Знак А со штришком под ним.","svg":"./assets/stenography/akopyan/ak_ya.svg","png":"./assets/stenography/akopyan/ak_ya.png","grading":"cloud","strokeCount":2,"loopCount":0,"reverseAcceptedLetters":["Я"],"ambiguityNote":null,"templates":[[[[201.0,91.0],[198.3,92.3],[195.6,93.6],[193.0,94.9],[190.3,96.3],[187.7,97.6],[185.0,98.9],[182.3,100.2],[179.5,101.3],[176.8,102.4],[174.1,103.7],[171.6,105.3],[169.0,106.8],[166.4,108.2],[163.7,109.5],[161.0,110.8],[158.3,112.1],[155.7,113.4],[153.1,115.0],[150.7,116.6],[148.2,118.3],[145.6,119.8],[143.0,121.3],[140.4,122.7],[137.7,124.0],[135.1,125.3],[132.4,126.6],[129.7,127.9],[127.1,129.3],[124.6,131.0],[122.2,132.7],[119.6,134.3],[117.1,135.9],[114.7,137.6],[112.2,139.3],[109.7,140.8],[107.1,142.2],[104.5,143.7],[101.9,145.3],[99.5,147.0],[97.0,148.6],[94.5,150.2],[92.1,151.9],[89.7,153.8],[87.4,155.7],[85.0,157.4],[82.4,158.9],[79.9,160.4],[77.4,162.0],[74.9,163.7],[72.4,165.3],[69.9,167.0],[67.5,168.7],[65.1,170.5],[62.7,172.3],[60.3,173.9],[57.9,175.7],[56.0,178.0]],[[120,191],[136,191]]]]},{"id":"st_e","letter":"Е / Ё / Э","hint":"Один гласный знак для Е, Ё и Э.","svg":"./assets/stenography/akopyan/ak_e.svg","png":"./assets/stenography/akopyan/ak_e.png","grading":"cloud","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Е","Ё","Э"],"ambiguityNote":null,"templates":[[[[152.0,178.0],[149.2,178.7],[146.3,178.9],[143.5,179.0],[140.6,179.0],[137.7,179.0],[134.9,179.0],[132.0,179.0],[129.1,179.0],[126.2,179.0],[123.4,179.0],[120.5,179.0],[117.6,179.0],[114.7,179.0],[111.9,179.0],[109.0,179.0]]]]},{"id":"st_i","letter":"И / Ы","hint":"Один гласный знак для И и Ы.","svg":"./assets/stenography/akopyan/ak_i.svg","png":"./assets/stenography/akopyan/ak_i.png","grading":"cloud","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["И","Ы"],"ambiguityNote":null,"templates":[[[[145.0,90.0],[143.7,92.6],[142.4,95.3],[141.4,98.1],[140.5,100.9],[139.6,103.7],[138.7,106.5],[138.0,109.3],[137.2,112.2],[136.2,114.9],[135.2,117.7],[134.4,120.5],[133.4,123.3],[132.4,126.1],[131.6,128.9],[130.6,131.7],[129.5,134.4],[128.5,137.2],[127.5,140.0],[126.5,142.7],[125.6,145.6],[124.7,148.3],[123.8,151.2],[123.2,154.0],[122.6,156.9],[121.8,159.8],[120.8,162.5],[119.7,165.3],[118.6,168.0],[117.5,170.7],[116.6,173.5],[115.2,176.1],[113.0,178.0]]]]},{"id":"st_o","letter":"О","hint":"Гласный знак для О.","svg":"./assets/stenography/akopyan/ak_o.svg","png":"./assets/stenography/akopyan/ak_o.png","grading":"cloud","strokeCount":3,"loopCount":0,"reverseAcceptedLetters":["О"],"ambiguityNote":null,"templates":[[[[137.0,153.0],[136.2,153.9],[136.0,155.0]],[[141.0,154.0],[138.5,154.7],[136.0,155.0]],[[136.0,155.0],[135.0,157.5],[133.5,159.8],[131.9,162.0],[130.4,164.3],[129.1,166.7],[127.7,169.1],[126.3,171.4],[125.0,173.8],[123.4,176.0],[121.5,177.9],[119.0,179.0]]]]},{"id":"st_u","letter":"У / Ю","hint":"Один гласный знак для У и Ю.","svg":"./assets/stenography/akopyan/ak_u.svg","png":"./assets/stenography/akopyan/ak_u.png","grading":"cloud","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["У","Ю"],"ambiguityNote":null,"templates":[[[[52,176],[204,176]]]]},{"id":"st_j","letter":"Й","hint":"В середине слова — знак И с коротким штрихом сверху; в конце загибается влево.","svg":"./assets/stenography/akopyan/ak_j.svg","png":"./assets/stenography/akopyan/ak_j.png","grading":"cloud","strokeCount":2,"loopCount":0,"reverseAcceptedLetters":["Й"],"ambiguityNote":null,"templates":[[[[145.0,90.0],[143.7,92.6],[142.4,95.3],[141.4,98.1],[140.5,100.9],[139.6,103.7],[138.7,106.5],[138.0,109.3],[137.2,112.2],[136.2,114.9],[135.2,117.7],[134.4,120.5],[133.4,123.3],[132.4,126.1],[131.6,128.9],[130.6,131.7],[129.5,134.4],[128.5,137.2],[127.5,140.0],[126.5,142.7],[125.6,145.6],[124.7,148.3],[123.8,151.2],[123.2,154.0],[122.6,156.9],[121.8,159.8],[120.8,162.5],[119.7,165.3],[118.6,168.0],[117.5,170.7],[116.6,173.5],[115.2,176.1],[113.0,178.0]],[[120,66],[136,66]]]]},{"id":"st_hard","letter":"Ъ / Ь","hint":"Точка над предыдущим знаком; Ъ и Ь различаются по контексту.","svg":"./assets/stenography/akopyan/ak_hard_soft.svg","png":"./assets/stenography/akopyan/ak_hard_soft.png","grading":"cloud","strokeCount":1,"loopCount":0,"reverseAcceptedLetters":["Ъ","Ь"],"ambiguityNote":"В системе Акопьяна Ъ и Ь отмечаются точкой над предыдущим знаком.","templates":[[[[127,68],[129,68]]]]}]}/*STENO-AKOPYAN-BUILTIN-END*/;
var STENO_URL='./data/stenography.json';
var STENO_CACHE_KEY='nem_steno_cache_v1';
var STENO_PR_KEY='nem_steno_practice_v1';
var STENO_READ_KEY='nem_steno_read_v1';
var STENO_GOAL=10;          // дневная цель (не потолок — свободный режим копит дальше)
var STENO_CHECK_MS=420;     // пауза покоя перед автопроверкой (ТЗ: 350–500)
var STENO_NEXT_MS=800;      // пауза до следующей буквы после верного ответа (700–900)
var STENO_READ_NEXT_MS=850; // чтение: 700–1000
var STENO_FAIL_CLR_MS=650;  // через это время после ошибки штрихи уступают место обводке
var STENO_PASS=0.74, STENO_PASS_TRACE=0.68;   // пороги: чистовой / в режиме обводки
/* Настройки кисти (nem_steno_prefs_v1 — локально, слова и морзе не затронуты):
   paint — цвет (или 'default' = --violet-deep), width — толщина, fadeMs — через
   сколько секунд гаснет след; fadeMs=0 значит «не исчезает» (максимум ползунка). */
var STENO_PREF_KEY='nem_steno_prefs_v1';
var stenoPrefs={paint:'default', width:13, fadeMs:2000, system:'gess'};
var STENO_SHEET=256, STENO_CY=80, STENO_BY=176;
var STENO_RES=6, STENO_GRID=64, STENO_CELL=4, STENO_CNORM=20;   // 26→20: пакет ГЕСС плотнее по формам
var STENO_ANGS=[-7,-3.5,0,3.5,7];

var stenoContent={ready:false,error:false,count:0,system:'gess'};
var STENO_CARDS=[], STENO_MAP={};
var STENO_GESS_CARDS=[], STENO_GESS_SPACE={size:256,controlY:80,baselineY:176};
var stenoState=null, stenoReadState=null;
var stenoMode='draw';           // 'draw' | 'read'
var stenoTrace=false;           // показ серого эталона (включается ошибкой на букве)
var stenoDraw=[];               // штрихи текущей попытки в единицах листа
var stenoPid=null;              // pointerId основного пальца (мультитач игнорируется)
var stenoBusy=false;            // окно фидбека — ввод заморожен
var stenoCheckTimer=null, stenoNextTimer=null, stenoClrTimer=null, stenoReadTimer=null;
var stenoStartTries=0;           // ожидание старта приложения (retry в openSteno)
var stenoLastTimer=null;
var stenoPointAt=[];            // время каждой точки: хвост тает по сегментам во время движения
var stenoReadMiss=false, stenoReadSolved=false, stenoReadAnswer=''; // клавиатурный фидбек чтения
var stenoBusySince=0;           // окно фидбека: след «замерзает», чтобы результат было видно
var stenoPendingFresh=false;    // после промаха: первые штрихи следующей попытки затрут экран
var stenoFadeOn=false;          // один rAF-цикл затухания за раз

function stenoLoadPrefs(){
  try{
    var raw=localStorage.getItem(STENO_PREF_KEY);
    if(!raw) return;
    var p=JSON.parse(raw);
    if(p && typeof p==='object'){
      if(p.paint==='default' || (typeof p.paint==='string' && /^#[0-9a-f]{6}$/i.test(p.paint))) stenoPrefs.paint=p.paint;
      if(typeof p.width==='number' && p.width>=6 && p.width<=28) stenoPrefs.width=Math.round(p.width);
      if(typeof p.fadeMs==='number' && (p.fadeMs===0 || (p.fadeMs>=1000 && p.fadeMs<=7000))) stenoPrefs.fadeMs=p.fadeMs;
      if(p.system==='gess' || p.system==='akopyan') stenoPrefs.system=p.system;
    }
  }catch(e){}
}
function stenoSavePrefs(){ try{ localStorage.setItem(STENO_PREF_KEY, JSON.stringify(stenoPrefs)); }catch(e){} }
function stenoInk(){ return stenoPrefs.paint==='default' ? stenoVar('--violet-deep','#7a5ae0') : stenoPrefs.paint; }
function stenoRafCall(fn){ try{ if(typeof requestAnimationFrame==='function') return requestAnimationFrame(fn); }catch(e){} return setTimeout(fn, 16); }
function stenoShiftTrailTimes(ms){
  if(!(ms>0)) return;
  for(var i=0;i<stenoPointAt.length;i++){
    var row=stenoPointAt[i]||[];
    for(var j=0;j<row.length;j++) row[j]+=ms;
  }
}
function stenoTrailVisible(now){
  var fade=stenoPrefs.fadeMs;
  if(!(fade>0)) return false;
  var tNow=stenoBusySince || now || Date.now();
  for(var i=0;i<stenoDraw.length;i++){
    var stroke=stenoDraw[i]||[], times=stenoPointAt[i]||[];
    if(stroke.length===1 && times[0]!=null && tNow-times[0]<fade) return true;
    for(var j=1;j<stroke.length;j++) if(times[j]!=null && tNow-times[j]<fade) return true;
  }
  return false;
}
function stenoScheduleFade(){
  if(stenoFadeOn) return;
  if(!(stenoPrefs.fadeMs>0 && stenoDraw.length && !stenoBusy && stenoMode==='draw')) return;
  stenoFadeOn=true;
  var tick=function(){
    var on = stenoPrefs.fadeMs>0 && stenoMode==='draw' && !stenoBusy && stenoDraw.length && stenoContent.ready
             && (typeof state==='undefined' || !state || state.view==='steno');
    if(!on){ stenoFadeOn=false; return; }
    stenoPaint();
    if(stenoTrailVisible(Date.now())) stenoRafCall(tick); else stenoFadeOn=false;
  };
  stenoRafCall(tick);
}
function stenoUnfreeze(){
  if(!stenoBusySince) return;
  var d=Date.now()-stenoBusySince; stenoBusySince=0;
  stenoShiftTrailTimes(d);   // время фидбека не «съедает» след
  stenoScheduleFade();
}
function stenoCancelTimers(){
  if(stenoCheckTimer){ clearTimeout(stenoCheckTimer); stenoCheckTimer=null; }
  if(stenoNextTimer){ clearTimeout(stenoNextTimer); stenoNextTimer=null; }
  if(stenoClrTimer){ clearTimeout(stenoClrTimer); stenoClrTimer=null; }
  if(stenoReadTimer){ clearTimeout(stenoReadTimer); stenoReadTimer=null; }
  if(stenoBusySince){ var dd=Date.now()-stenoBusySince; stenoBusySince=0; stenoShiftTrailTimes(dd); }
  stenoBusy=false;
  var w=$('stenoPadWrap'); if(w){ w.classList.remove('is-ok'); w.classList.remove('is-bad'); }
}

/* ---------- данные: валидация пакета ---------- */
function stenoIsRelPath(p, ext){
  if(typeof p!=='string' || !p || p.length>200) return false;
  if(p.indexOf('://')>=0 || p.indexOf('//')===0) return false;
  if(p.indexOf('./')!==0 || p.indexOf('..')>=0) return false;
  return new RegExp('^\\./[A-Za-z0-9_\\-/\\.]+\\.'+ext+'$').test(p);
}
function stenoValidTmpl(t){
  if(!Array.isArray(t) || !t.length || t.length>6) return false;      // до 6 штрихов
  for(var i=0;i<t.length;i++){
    var st=t[i];
    if(!Array.isArray(st) || st.length<1 || st.length>4000) return false;
    for(var j=0;j<st.length;j++){
      var p=st[j];
      if(!Array.isArray(p) || p.length<2 || typeof p[0]!=='number' || typeof p[1]!=='number') return false;
      if(p[0]<-10 || p[0]>266 || p[1]<-10 || p[1]>266) return false;  // только поле 256 (±погрешность)
    }
  }
  return true;
}
function stenoValidatePkg(root){
  if(!root || typeof root!=='object' || Array.isArray(root)) return {error:'schema'};
  if(root.schemaVersion!==1) return {error:'schema'};
  if(root.language!=='ru') return {error:'language'};
  if(!(typeof root.contentVersion==='number' && root.contentVersion>0)) return {error:'version'};
  var sp=root.space;
  if(!sp || sp.size!==256 || sp.controlY!==80 || (sp.baselineY!==176 && sp.baselineY!==180)) return {error:'space'};
  if(!Array.isArray(root.cards) || root.cards.length<8 || root.cards.length>64) return {error:'cards'};
  var seen={}, out=[];
  for(var i=0;i<root.cards.length;i++){
    var c=root.cards[i];
    if(!c || typeof c!=='object') return {error:'card'};
    if(typeof c.id!=='string' || !/^st_[a-z][a-z0-9]{0,9}$/.test(c.id) || seen[c.id]) return {error:'id'};
    if(typeof c.letter!=='string' || !/^[А-Я]$/.test(c.letter)) return {error:'letter'};
    if(typeof c.hint!=='string' || !c.hint || c.hint.length>240) return {error:'hint'};
    if(!stenoIsRelPath(c.svg,'svg') || !stenoIsRelPath(c.png,'png')) return {error:'img'};
    if(!Array.isArray(c.templates) || !c.templates.length || c.templates.length>4) return {error:'templates'};
    for(var k=0;k<c.templates.length;k++) if(!stenoValidTmpl(c.templates[k])) return {error:'template'};
    var acc=c.reverseAcceptedLetters;
    if(!Array.isArray(acc) || !acc.length || acc.length>3) return {error:'reverse'};
    for(k=0;k<acc.length;k++) if(typeof acc[k]!=='string' || !/^[А-ЯЁ]$/.test(acc[k])) return {error:'reverse'};
    if(acc.indexOf(c.letter)<0) return {error:'reverse-main'};        // своя буква обязательна
    if(c.ambiguityNote!=null && (typeof c.ambiguityNote!=='string' || c.ambiguityNote.length>300)) return {error:'note'};
    var sc=(typeof c.strokeCount==='number')?c.strokeCount:0, lp=(typeof c.loopCount==='number')?c.loopCount:0;
    seen[c.id]=1;
    out.push({id:c.id, letter:c.letter, hint:c.hint, svg:c.svg, png:c.png,
              strokeCount:sc, loopCount:lp,
              reverseAcceptedLetters:acc.slice(),
              ambiguityNote:(typeof c.ambiguityNote==='string'?c.ambiguityNote:null),
              templates:c.templates});
  }
  return {cards:out, contentVersion:root.contentVersion,
          space:{size:256, controlY:sp.controlY, baselineY:sp.baselineY},
          updatedAt:(typeof root.updatedAt==='string'?root.updatedAt.slice(0,40):null)};
}
/* Предзагрузка знаков фоном убрана (R44): <img> кэшируется самим браузером,
   а шторм из 32 JS-fetch на старте забивал медленный канал WebView — из-за него
   и словарь, и знаки «загружались вечно». */
function stenoActivateSystem(system){
  var useAk=system==='akopyan' && typeof STENO_AKOPYAN_BUILTIN==='object' && STENO_AKOPYAN_BUILTIN &&
            Array.isArray(STENO_AKOPYAN_BUILTIN.cards) && STENO_AKOPYAN_BUILTIN.cards.length;
  var cards=useAk?STENO_AKOPYAN_BUILTIN.cards:STENO_GESS_CARDS;
  var space=useAk?STENO_AKOPYAN_BUILTIN.space:STENO_GESS_SPACE;
  if(!Array.isArray(cards) || !cards.length){ stenoContent.ready=false; return; }
  STENO_CARDS=cards; STENO_MAP={};
  for(var i=0;i<cards.length;i++) STENO_MAP[cards[i].id]=cards[i];
  if(space && space.size===256 && space.controlY===80 && (space.baselineY===176||space.baselineY===180)){
    STENO_CY=space.controlY; STENO_BY=space.baselineY;   // канонические координаты шаблонов и fallback-кадра
    stenoContent.space=space;
  }
  stenoContent.ready=true; stenoContent.error=false; stenoContent.count=cards.length;
  stenoContent.system=useAk?'akopyan':'gess';
}
function stenoSetCards(cards, space){
  STENO_GESS_CARDS=cards;
  if(space && space.size===256 && space.controlY===80 && (space.baselineY===176||space.baselineY===180))
    STENO_GESS_SPACE=space;
  stenoActivateSystem(stenoPrefs.system);
}
function stenoReadCache(){
  try{
    var raw=localStorage.getItem(STENO_CACHE_KEY);
    if(!raw) return null;
    var pkg=stenoValidatePkg(JSON.parse(raw));
    return pkg.error?null:pkg;
  }catch(e){ return null; }
}
function stenoWriteCache(pkg){
  try{
    localStorage.setItem(STENO_CACHE_KEY, JSON.stringify({
      schemaVersion:1, contentVersion:pkg.contentVersion, language:'ru',
      space:(STENO_GESS_SPACE||{size:256, controlY:80, baselineY:176}), cards:pkg.cards
    }));
  }catch(e){}
}
function loadStenoContent(){
  var cached=stenoReadCache();
  if(!stenoContent.ready && typeof STENO_BUILTIN!=='undefined' && STENO_BUILTIN){
    try{ var bp=stenoValidatePkg(STENO_BUILTIN); if(!bp.error){ stenoSetCards(bp.cards, bp.space); } }catch(e){}
  }
  if(cached){
    stenoSetCards(cached.cards, cached.space); renderStenoHome();
    // Инициализация стено раньше слов: в этот момент app state ещё может быть undefined.
    if(typeof state!=='undefined' && state && state.view==='steno') renderSteno();
  }
  if(typeof fetch!=='function'){ if(!stenoContent.ready){ stenoContent.error=true; } renderStenoHome(); return; }
  var ctrl=null, timer=null;
  try{ if(typeof AbortController==='function') ctrl=new AbortController(); }catch(e){ ctrl=null; }
  var opts={cache:'no-cache', credentials:'same-origin'};
  if(ctrl){ opts.signal=ctrl.signal; timer=setTimeout(function(){ try{ctrl.abort();}catch(e){} }, 25000); }
  fetch(STENO_URL, opts).then(function(res){
    if(!res.ok) throw new Error('http '+res.status);
    return res.text();
  }).then(function(text){
    if(timer) clearTimeout(timer);
    var pkg=stenoValidatePkg(JSON.parse(cleanJsonText(text)));
    if(pkg.error) throw new Error(pkg.error);
    stenoSetCards(pkg.cards, pkg.space);
    stenoWriteCache(pkg);
    renderStenoHome();
    if(typeof state!=='undefined' && state && state.view==='steno') renderSteno();
  }).catch(function(err){
    if(timer) clearTimeout(timer);
    if(!stenoContent.ready){ stenoContent.error=true; renderStenoHome(); }  // кэш важнее сети
    try{ console.warn('stenography load failed:', err && err.message); }catch(e){}
  });
}

/* ---------- состояние (два независимых ключа) ---------- */
function stenoWeights(src){
  var out={};
  if(src && typeof src==='object' && !Array.isArray(src)){
    Object.keys(src).forEach(function(k){
      var v=src[k];
      if(typeof k==='string' && /^st_[a-z][a-z0-9]{0,9}$/.test(k) && typeof v==='number' && v>=0 && v<=16) out[k]=v;
    });
  }
  return out;
}
function freshStenoState(){
  return {schemaVersion:1, day:realToday(), dailyCorrect:0, dailyAttempts:0, dailyErrors:0,
          weights:{}, currentId:null, freeMode:false, streak:0, streakBest:0, history:{}, updatedAt:Date.now()};
}
function freshStenoRead(){
  return {schemaVersion:1, day:realToday(), dailyCorrect:0, dailyAttempts:0, dailyErrors:0,
          weights:{}, currentId:null, streak:0, streakBest:0, updatedAt:Date.now()};
}
function stenoLoadStates(){
  [ [STENO_PR_KEY,'pr'], [STENO_READ_KEY,'read'] ].forEach(function(pair){
    var raw=null, s=null;
    try{ raw=localStorage.getItem(pair[0]); }catch(e){}
    try{ if(raw){ var p=JSON.parse(raw); if(p && typeof p==='object' && p.schemaVersion===1) s=p; } }catch(e){}
    if(!s){ if(pair[1]==='pr'){ stenoState=freshStenoState(); } else { stenoReadState=freshStenoRead(); } return; }
    var st={
      schemaVersion:1,
      day:(typeof s.day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s.day)) ? s.day : realToday(),
      dailyCorrect:clampInt(s.dailyCorrect,0,1000000),
      dailyAttempts:clampInt(s.dailyAttempts,0,1000000),
      dailyErrors:clampInt(s.dailyErrors,0,1000000),
      weights:stenoWeights(s.weights),
      // карточки могли ещё не загрузиться (сеть) — id валидируем, когда они есть
      currentId:(typeof s.currentId==='string' && s.currentId && (!stenoContent.ready || STENO_MAP[s.currentId])) ? s.currentId : null,
      freeMode:!!s.freeMode,
      streak:clampInt(s.streak,0,1000000),
      streakBest:clampInt(s.streakBest,0,1000000),
      history:(s.history && typeof s.history==='object' && !Array.isArray(s.history)) ? s.history : {},
      updatedAt:(typeof s.updatedAt==='number') ? s.updatedAt : Date.now()
    };
    if(st.streakBest<st.streak) st.streakBest=st.streak;   // рекорд не меньше живой серии
    if(pair[1]==='pr') stenoState=st; else stenoReadState=st;
  });
  stenoEnsureDays();
}
function stenoSave(st, key){
  if(!st) return;
  try{
    st.updatedAt=Date.now();
    if(key===STENO_PR_KEY){
      /* зеркало дневных счётчиков — питает график «Статистика → Стенография» */
      if(!st.history || typeof st.history!=='object' || Array.isArray(st.history)) st.history={};
      st.history[st.day]={correct:st.dailyCorrect|0, attempts:st.dailyAttempts|0, errors:st.dailyErrors|0};
      var hk=Object.keys(st.history).sort();
      if(hk.length>90) hk.slice(0, hk.length-90).forEach(function(k){ delete st.history[k]; });
    }
    localStorage.setItem(key, JSON.stringify(st));
  }catch(e){}
}
function saveSteno(){ stenoSave(stenoState, STENO_PR_KEY); }
function saveStenoRead(){ stenoSave(stenoReadState, STENO_READ_KEY); }
function stenoEnsureDays(){          // новая дата → счётчики дня с нуля; ВЕСА остаются
  var today=realToday();
  if(stenoState && stenoState.day!==today){
    stenoState.day=today; stenoState.dailyCorrect=0; stenoState.dailyAttempts=0; stenoState.dailyErrors=0;
    stenoState.currentId=null; stenoState.freeMode=false;
    saveSteno();
  }
  if(stenoReadState && stenoReadState.day!==today){
    stenoReadState.day=today; stenoReadState.dailyCorrect=0; stenoReadState.dailyAttempts=0; stenoReadState.dailyErrors=0;
    stenoReadState.currentId=null;
    saveStenoRead();
  }
}
function stenoWeight(st,id){ var w=st.weights[id]; return (typeof w==='number' && w>=0)?w:0; }
function stenoPick(st){
  if(!STENO_CARDS.length) return null;
  var pool=STENO_CARDS.filter(function(c){ return c.id!==st.currentId; });
  if(!pool.length) pool=STENO_CARDS;
  var total=0,i;
  for(i=0;i<pool.length;i++) total+=1+stenoWeight(st,pool[i].id);
  if(total<=0) return pool[0].id;
  var r=Math.random()*total;
  for(i=0;i<pool.length;i++){ r-=1+stenoWeight(st,pool[i].id); if(r<0) return pool[i].id; }
  return pool[pool.length-1].id;
}
function stenoSetSystem(system){
  var next=system==='akopyan'?'akopyan':'gess';
  var changed=next!==stenoPrefs.system;
  stenoPrefs.system=next;
  stenoSavePrefs();
  try{ stenoSyncSystemUI(); }catch(e){}
  if(!changed) return;
  stenoCancelTimers();
  stenoDraw=[]; stenoPointAt=[]; stenoPendingFresh=false; stenoTrace=false; stenoPid=null;
  stenoReadMiss=false; stenoReadSolved=false; stenoReadAnswer='';
  stenoActivateSystem(next);
  if(stenoContent.ready){
    if(stenoState){ stenoState.currentId=stenoPick(stenoState); saveSteno(); }
    if(stenoReadState){ stenoReadState.currentId=stenoPick(stenoReadState); saveStenoRead(); }
  }
  try{
    if(typeof state!=='undefined' && state && state.view==='steno') renderSteno();
    else renderStenoHome();
  }catch(e){}
}

/* ---------- GREYFER: локальный грейд росчерка ----------
   Точное зеркало score_vs_template() из steno/gen_steno.py (константы там). */
function stenoResample(strokes, step){
  var out=[];
  for(var si=0;si<strokes.length;si++){
    var st=strokes[si], pts=[st[0]], acc=0;
    for(var i=1;i<st.length;i++){
      var x0=st[i-1][0], y0=st[i-1][1], x1=st[i][0], y1=st[i][1];
      var seg=Math.sqrt((x1-x0)*(x1-x0)+(y1-y0)*(y1-y0));
      if(seg<1e-9) continue;
      while(acc+seg>=step){
        var t=(step-acc)/seg;
        x0=x0+(x1-x0)*t; y0=y0+(y1-y0)*t;
        pts.push([x0,y0]);
        seg=Math.sqrt((st[i][0]-x0)*(st[i][0]-x0)+(st[i][1]-y0)*(st[i][1]-y0)); acc=0;
      }
      acc+=seg;
    }
    if(pts.length<2) pts.push([st[st.length-1][0], st[st.length-1][1]]);
    out.push(pts);
  }
  return out;
}
function stenoGrid(strokes){
  var G=STENO_GRID, C=STENO_CELL, INF=1e9;
  var g=new Float64Array(G*G); g.fill(INF);
  var si, i, p;
  for(si=0;si<strokes.length;si++){
    var st=strokes[si];
    for(i=0;i<st.length;i++){
      p=st[i];
      var gx=Math.floor(p[0]/C); if(gx<0)gx=0; if(gx>=G)gx=G-1;
      var gy=Math.floor(p[1]/C); if(gy<0)gy=0; if(gy>=G)gy=G-1;
      g[gy*G+gx]=0;
    }
  }
  for(var pass=0;pass<2;pass++){
    var y,x,idx;
    for(y=0;y<G;y++){
      for(x=0;x<G;x++){
        idx=y*G+x;
        if(g[idx]<=0) continue;
        var m=g[idx];
        if(x>0 && g[idx-1]+C<m) m=g[idx-1]+C;
        if(y>0 && g[idx-G]+C<m) m=g[idx-G]+C;
        g[idx]=m;
      }
    }
    for(y=G-1;y>=0;y--){
      for(x=G-1;x>=0;x--){
        idx=y*G+x;
        if(g[idx]<=0) continue;
        m=g[idx];
        if(x<G-1 && g[idx+1]+C<m) m=g[idx+1]+C;
        if(y<G-1 && g[idx+G]+C<m) m=g[idx+G]+C;
        g[idx]=m;
      }
    }
  }
  return g;
}
function stenoSample(g,x,y){
  var G=STENO_GRID, C=STENO_CELL;
  var gx=Math.floor(x/C); if(gx<0)gx=0; if(gx>=G)gx=G-1;
  var gy=Math.floor(y/C); if(gy<0)gy=0; if(gy>=G)gy=G-1;
  return g[gy*G+gx];
}
function stenoGeom(strokes){
  var n=0,cx=0,cy=0,minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  for(var si=0;si<strokes.length;si++){
    var st=strokes[si];
    for(var i=0;i<st.length;i++){
      var x=st[i][0], y=st[i][1];
      n++; cx+=x; cy+=y;
      if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y;
    }
  }
  if(!n) return [128,128,1,128,128];
  var diag=Math.sqrt((maxx-minx)*(maxx-minx)+(maxy-miny)*(maxy-miny))||1;
  return [cx/n, cy/n, diag, (minx+maxx)/2, (miny+maxy)/2];
}
function stenoRot(strokes, ang, cx, cy){
  if(!ang) return strokes;
  var a=ang*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a), out=[];
  for(var si=0;si<strokes.length;si++){
    var st=strokes[si], pts=[];
    for(var i=0;i<st.length;i++){
      var x=st[i][0]-cx, y=st[i][1]-cy;
      pts.push([cx+x*ca-y*sa, cy+x*sa+y*ca]);
    }
    out.push(pts);
  }
  return out;
}
function stenoLoops(strokes){
  var n=0;
  for(var si=0;si<strokes.length;si++){
    var st=strokes[si];
    if(st.length<12) continue;
    var dx=st[st.length-1][0]-st[0][0], dy=st[st.length-1][1]-st[0][1];
    if(dx*dx+dy*dy>18*18) continue;
    var per=0;
    for(var i=1;i<st.length;i++){
      var ax=st[i][0]-st[i-1][0], ay=st[i][1]-st[i-1][1];
      per+=Math.sqrt(ax*ax+ay*ay);
    }
    if(per>=40 && per<=240) n++;
  }
  return n;
}
function stenoPairDist(a, b, ga, gb){
  var s=0,i,p;
  for(i=0;i<a.length;i++){ p=a[i]; s+=stenoSample(gb,p[0],p[1]); }
  var dab=s/a.length;
  s=0;
  for(i=0;i<b.length;i++){ p=b[i]; s+=stenoSample(ga,p[0],p[1]); }
  return (dab + s/b.length)/2;
}
function stenoStrokePen(user, ref){
  var ug=[],rg=[],i;
  for(i=0;i<user.length;i++) ug.push(stenoGrid([user[i]]));
  for(i=0;i<ref.length;i++) rg.push(stenoGrid([ref[i]]));
  var um=[], missRef=0;
  for(i=0;i<user.length;i++) um.push(false);
  for(var ia=0;ia<ref.length;ia++){
    var best=1e9, bi=-1;
    for(var ib=0;ib<user.length;ib++){
      if(um[ib]) continue;
      var d=stenoPairDist(ref[ia], user[ib], rg[ia], ug[ib]);
      if(d<best){ best=d; bi=ib; }
    }
    if(bi>=0 && best<22){ um[bi]=true; } else missRef++;
  }
  var missUser=0;
  for(i=0;i<user.length;i++) if(!um[i]) missUser++;
  var p=0.30*missRef + 0.22*missUser;
  if(p===0 && user.length!==ref.length) p+=0.05;
  return Math.min(0.55,p);
}
function stenoScoreTmpl(userRaw, tmpl){
  var u=stenoResample(userRaw, STENO_RES);
  var ref=stenoResample(tmpl, STENO_RES);
  var ug=stenoGeom(u), rg=stenoGeom(ref);
  if(rg[2]<10){                                                // «точка» Ъ/Ь в ГЕСС — короткое касание валидно как штрих
    var dtl=0, dpts=0;
    for(var q=0;q<u.length;q++){ dpts+=u[q].length; for(var w2=1;w2<u[q].length;w2++) dtl+=Math.hypot(u[q][w2][0]-u[q][w2-1][0], u[q][w2][1]-u[q][w2-1][1]); }
    if(u.length===1 && dpts>=1 && dpts<=80 && dtl<24 && Math.hypot(ug[0]-rg[0], ug[1]-rg[1])<26) return 0.85;
    return 0;
  }
  var grid=stenoGrid(ref);
  var sRaw=rg[2]/(ug[2]||1);                                  // «меры» Соколова — смыслоразличительны
  var s=Math.min(1.15, Math.max(0.85, sRaw));
  var tx=Math.min(14, Math.max(-14, rg[0]-ug[0])), ty=Math.min(14, Math.max(-14, rg[1]-ug[1]));
  var moved=[],i,j;
  for(i=0;i<u.length;i++){
    var pts=[];
    for(j=0;j<u[i].length;j++){
      var p=u[i][j];
      pts.push([ug[0]+(p[0]-ug[0])*s+tx, ug[1]+(p[1]-ug[1])*s+ty]);
    }
    moved.push(pts);
  }
  var best=-1, bestCand=null;
  for(var k=0;k<STENO_ANGS.length;k++){
    var cand=stenoRot(moved, STENO_ANGS[k], rg[0], rg[1]);
    var ugFull=stenoGrid(cand);
    var nu=0, nr=0, sd=0;
    for(i=0;i<cand.length;i++) for(j=0;j<cand[i].length;j++){ nu++; sd+=stenoSample(grid,cand[i][j][0],cand[i][j][1]); }
    var sr=0;
    for(i=0;i<ref.length;i++) for(j=0;j<ref[i].length;j++){ nr++; sr+=stenoSample(ugFull,ref[i][j][0],ref[i][j][1]); }
    if(!nu||!nr) continue;
    var sim=Math.max(0, 1-((sd/nu + sr/nr)/2)/STENO_CNORM);
    if(sim>best){ best=sim; bestCand=cand; }
  }
  if(best<0) return 0;
  var sim2=best - stenoStrokePen(bestCand, ref);
  if(rg[2] && stenoLoops(ref)>0 && stenoLoops(bestCand)===0) sim2-=0.10;   // пропущенная петля
  /* длина штриха («мера») в ГЕСС различает буквы (И 134 vs Е 102 и т.п.) —
     наказываем непрерывно, а не скидкой 0.08 за клампом. */
  var szl=Math.abs(Math.log(Math.max(0.2, Math.min(5, sRaw))));
  if(szl>0.12) sim2-=Math.min(0.45, (szl-0.12)*1.35);
  /* позиция относительно направляющих: мягкий, но реальный штраф (пакет различает
     знаки и высотой: Т-свод над основной, хвост Ц под линией…) */
  var pdx=ug[0]-rg[0], pdy=ug[1]-rg[1];
  var pd=Math.sqrt(pdx*pdx+pdy*pdy);
  if(pd>12) sim2-=Math.min(0.22, (pd-12)/26*0.3);
  var bonus=0;                                                                 // направление: бонус, не вето
  for(i=0;i<moved.length && i<ref.length;i++){
    var a=moved[i], b=ref[i];
    if(a.length<2||b.length<2) continue;
    var ax=a[a.length-1][0]-a[0][0], ay=a[a.length-1][1]-a[0][1];
    var bx=b[b.length-1][0]-b[0][0], by=b[b.length-1][1]-b[0][1];
    var an=Math.sqrt(ax*ax+ay*ay), bn=Math.sqrt(bx*bx+by*by);
    if(an>6 && bn>6 && (ax*bx+ay*by)/(an*bn)>0.7) bonus+=0.015;
  }
  sim2+=Math.min(0.04,bonus);
  return Math.max(0, Math.min(1, sim2));
}
function stenoScoreCloud(userRaw, tmpl){
  if(!userRaw || !userRaw.length || !tmpl || !tmpl.length) return 0;
  var ref=[];
  for(var ri=0;ri<tmpl.length;ri++) for(var rp=0;rp<tmpl[ri].length;rp++) ref.push(tmpl[ri][rp]);
  var u=stenoResample(userRaw, STENO_RES), user=[];
  for(var ui=0;ui<u.length;ui++) for(var up=0;up<u[ui].length;up++) user.push(u[ui][up]);
  if(!ref.length || !user.length) return 0;
  var rg=stenoGeom([ref]), ug=stenoGeom([user]);
  if(rg[2]<10){
    var len=0, points=0;
    for(ui=0;ui<u.length;ui++){
      points+=u[ui].length;
      for(up=1;up<u[ui].length;up++) len+=Math.hypot(u[ui][up][0]-u[ui][up-1][0],u[ui][up][1]-u[ui][up-1][1]);
    }
    return userRaw.length===1 && points<=80 && len<24 && Math.hypot(ug[0]-rg[0],ug[1]-rg[1])<26 ? 0.85 : 0;
  }
  if(ug[2]<10) return 0;
  var sRaw=rg[2]/(ug[2]||1), s=Math.min(1.15,Math.max(0.85,sRaw));
  var tx=Math.min(14,Math.max(-14,rg[0]-ug[0])), ty=Math.min(14,Math.max(-14,rg[1]-ug[1]));
  var moved=[];
  for(ui=0;ui<user.length;ui++) moved.push([ug[0]+(user[ui][0]-ug[0])*s+tx,ug[1]+(user[ui][1]-ug[1])*s+ty]);
  var refGrid=stenoGrid([ref]), best=-1;
  for(var ai=0;ai<STENO_ANGS.length;ai++){
    var cand=stenoRot([moved],STENO_ANGS[ai],rg[0],rg[1])[0];
    var userGrid=stenoGrid([cand]), su=0, sr=0;
    for(ui=0;ui<cand.length;ui++) su+=stenoSample(refGrid,cand[ui][0],cand[ui][1]);
    for(ri=0;ri<ref.length;ri++) sr+=stenoSample(userGrid,ref[ri][0],ref[ri][1]);
    var sim=Math.max(0,1-((su/cand.length+sr/ref.length)/2)/STENO_CNORM);
    var sizePenalty=Math.abs(Math.log(Math.max(0.2,Math.min(5,sRaw))));
    if(sizePenalty>0.12) sim-=Math.min(0.45,(sizePenalty-0.12)*1.35);
    var pd=Math.hypot(ug[0]-rg[0],ug[1]-rg[1]);
    if(pd>12) sim-=Math.min(0.22,(pd-12)/26*0.3);
    if(sim>best) best=sim;
  }
  return Math.max(0,Math.min(1,best));
}
function stenoGrade(userRaw, card){
  if(!card || !card.templates) return 0;
  if(card.grading==='cloud') return stenoScoreCloud(userRaw,card.templates[0]);
  var best=0;
  for(var i=0;i<card.templates.length;i++) best=Math.max(best, stenoScoreTmpl(userRaw, card.templates[i]));
  return best;
}

/* ---------- поле рисования ---------- */
function stenoCanvasCssW(){
  var cv=$('stenoPad'); if(!cv) return 288;
  var w=cv.clientWidth || (cv.parentElement && cv.parentElement.clientWidth) || 0;
  if(w<1) w=288;            // jsdom/неизвестный layout: фиксированный логический лист
  return Math.max(1, Math.min(480, w));
}
function stenoSizePad(){
  var cv=$('stenoPad'); if(!cv) return null;
  var css=stenoCanvasCssW();
  var dpr=Math.max(1, Math.min(3, window.devicePixelRatio||1));
  var px=Math.round(css*dpr);
  /* буфер квадратный и в точном размере CSS-бокса: нижний край знака
     не обрезается на компактных экранах и координаты пальца совпадают. */
  if(cv.width!==px || cv.height!==px){ cv.width=px; cv.height=px; }
  if(cv.style.height!==css+'px'){ cv.style.height=css+'px'; }
  var ctx=null; try{ ctx=cv.getContext('2d'); }catch(e){ ctx=null; }
  return {cv:cv, ctx:ctx, dpr:dpr, css:css};
}
function stenoFitPad(){
  if(stenoMode!=='draw') return 0;
  var pane=$('stenoDrawPane'), wrap=$('stenoPadWrap'), letter=$('stenoBigLetter');
  if(!pane || !wrap || !letter) return 0;
  var pr=null; try{ pr=pane.getBoundingClientRect(); }catch(e){}
  var pw=pane.clientWidth || (pr&&pr.width) || 0;
  var ph=pane.clientHeight || (pr&&pr.height) || 0;
  if(pw<1 || ph<1) return 0;   // скрытая вкладка или ещё не рассчитана раскладка
  var gap=6;
  try{
    var ps=getComputedStyle(pane), pg=parseFloat(ps.rowGap||ps.gap);
    if(isFinite(pg) && pg>=0) gap=pg;
  }catch(e){}
  var fixed=0, count=0;
  var parts=[pane.querySelector('.morse-codewrap'), $('stenoTraceNote')];
  for(var i=0;i<parts.length;i++){
    var el=parts[i]; if(!el || el.hidden) continue;
    var er=null; try{ er=el.getBoundingClientRect(); }catch(e){}
    fixed+=(er&&er.height) || el.offsetHeight || 0;
    count++;
  }
  var vh=window.innerHeight || ph;
  var gaps=gap*(count+1);   // буква + подсказки/заметка + поле
  /* Сначала сохраняем прежний максимальный размер поля: он рассчитывался
     с буквой 14vh. Всё свободное место после этого отдаём карточке буквы. */
  var oldLetter=Math.floor(Math.min(pw,vh*.14));
  var oldAvailable=Math.floor(ph-fixed-gaps-oldLetter);
  var size=Math.floor(Math.min(pw,oldAvailable,vh*.58));
  if(size<1) return 0;
  var letterSize=Math.floor(Math.min(pw,ph-fixed-gaps-size));
  if(letterSize<1) return 0;
  letter.style.width=letterSize+'px'; letter.style.height=letterSize+'px';
  wrap.style.width=size+'px'; wrap.style.height=size+'px';
  return size;
}
function stenoVar(name, fb){
  try{
    var v=getComputedStyle(document.documentElement).getPropertyValue(name);
    if(v && v.trim()) return v.trim();
  }catch(e){}
  return fb;
}
function stenoCurveTo(ctx, st){
  /* Гладкая интерполяция эталона: Catmull–Rom → кубические Безье.
     Не трогаем реальный росчерк пользователя и его посегментное затухание. */
  if(!st || st.length<2) return;
  for(var ci=0;ci<st.length-1;ci++){
    var p0=st[ci>0?ci-1:ci], p1=st[ci], p2=st[ci+1], p3=st[ci+2<st.length?ci+2:ci+1];
    var c1x=p1[0]+(p2[0]-p0[0])/6, c1y=p1[1]+(p2[1]-p0[1])/6;
    var c2x=p2[0]-(p3[0]-p1[0])/6, c2y=p2[1]-(p3[1]-p1[1])/6;
    if(typeof ctx.bezierCurveTo==='function') ctx.bezierCurveTo(c1x,c1y,c2x,c2y,p2[0],p2[1]);
    else ctx.lineTo(p2[0],p2[1]);
  }
}
function stenoPaint(){
  var pad=stenoSizePad(); if(!pad || !pad.ctx) return;
  var ctx=pad.ctx, k=pad.cv.width/256;
  ctx.setTransform(k,0,0,k,0,0);
  ctx.clearRect(0,0,256,256);
  /* направляющие: контрольная (пунктир) и основная (сплошная) */
  var lineCol=stenoVar('--line','rgba(120,120,140,.5)');
  ctx.save();
  ctx.strokeStyle=lineCol; ctx.lineWidth=1.6;
  var guideTop=STENO_SHEET*.10, guideBottom=STENO_SHEET*.90; // строка от 10% до 90% высоты поля
  ctx.setLineDash([7,7]); ctx.beginPath(); ctx.moveTo(14,guideTop); ctx.lineTo(242,guideTop); ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth=2.2; ctx.beginPath(); ctx.moveTo(14,guideBottom); ctx.lineTo(242,guideBottom); ctx.stroke();
  ctx.restore();
  var card=STENO_MAP[stenoState&&stenoState.currentId];
  if(stenoTrace && card && card.templates && card.templates.length){
    ctx.save();
    ctx.strokeStyle=stenoVar('--muted','#999'); ctx.globalAlpha=.85;   // эталон виден на любой теме
    ctx.lineWidth=9; ctx.lineCap='round'; ctx.lineJoin='round';
    var t=card.templates[0];
    for(var ti=0;ti<t.length;ti++){
      var st=t[ti]; if(st.length<2) continue;
      ctx.beginPath(); ctx.moveTo(st[0][0], st[0][1]);
      stenoCurveTo(ctx,st);
      ctx.stroke();
    }
    ctx.restore();
  }
  /* У каждого сегмента своё время: голова росчерка яркая, старый хвост
     постепенно растворяется уже пока палец движется. Геометрия stenoDraw
     сохраняется целиком для проверки — визуальное затухание её не обрезает. */
  var ink=stenoInk(), lw=stenoPrefs.width, fade=stenoPrefs.fadeMs;
  var nowMs=stenoBusySince || Date.now();
  ctx.save();
  ctx.strokeStyle=ink; ctx.fillStyle=ink;
  ctx.lineWidth=lw; ctx.lineCap='round'; ctx.lineJoin='round';
  for(var si=0;si<stenoDraw.length;si++){
    var s2=stenoDraw[si]; if(!s2 || !s2.length) continue;
    var times=stenoPointAt[si]||[];
    if(s2.length===1){
      var dotAt=(times[0]!=null)?times[0]:nowMs;
      var dotAlpha=fade>0?Math.max(0,Math.min(1,1-(nowMs-dotAt)/fade)):1;
      if(dotAlpha<=0) continue;
      ctx.globalAlpha=dotAlpha;
      ctx.beginPath(); ctx.arc(s2[0][0], s2[0][1], lw/2, 0, Math.PI*2); ctx.fill();
      continue;
    }
    for(var j=1;j<s2.length;j++){
      var stamp=(times[j]!=null)?times[j]:nowMs;
      var alpha=fade>0?Math.max(0,Math.min(1,1-(nowMs-stamp)/fade)):1;
      if(alpha<=0) continue;
      ctx.globalAlpha=alpha;
      ctx.beginPath(); ctx.moveTo(s2[j-1][0], s2[j-1][1]);
      ctx.lineTo(s2[j][0], s2[j][1]); ctx.stroke();
    }
  }
  ctx.restore();
}
function stenoPt(e){
  var cv=$('stenoPad'); if(!cv) return [0,0];
  var rect=null; try{ rect=cv.getBoundingClientRect(); }catch(err){}
  var w=(rect && rect.width>40) ? rect.width : cv.clientWidth || stenoCanvasCssW();
  var h=(rect && rect.height>40) ? rect.height : w;   // независимые оси: неквадратный бокс не искажает
  var ox=(rect && rect.left) || 0, oy=(rect && rect.top) || 0;
  var sx=STENO_SHEET/(w||STENO_SHEET), sy=STENO_SHEET/(h||STENO_SHEET);
  return [( (e.clientX||0) - ox )*sx, ( (e.clientY||0) - oy )*sy];
}
function stenoDown(e){
  if(stenoBusy || stenoMode!=='draw' || !stenoContent.ready) return;
  if(stenoPid!==null && e.pointerId!=null && e.pointerId!==stenoPid) return;  // мультитач: второй палец не ловим
  if(stenoCheckTimer){ clearTimeout(stenoCheckTimer); stenoCheckTimer=null; } // продлили росчерк — проверка сдвигается
  stenoPid=(e.pointerId!=null)?e.pointerId:1;
  try{ e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); }catch(err){}
  if(stenoPendingFresh){ stenoDraw=[]; stenoPointAt=[]; stenoPendingFresh=false; }   // после промаха пишем начисто
  var p=stenoPt(e), now=Date.now();
  stenoDraw.push([p]); stenoPointAt.push([now]);
  stenoPaint(); stenoScheduleFade();
  if(e.preventDefault) e.preventDefault();
}
function stenoMove(e){
  if(stenoPid===null || (e.pointerId!=null && e.pointerId!==stenoPid)) return;
  var st=stenoDraw[stenoDraw.length-1]; if(!st) return;
  var p=stenoPt(e), last=st[st.length-1];
  var cv=$('stenoPad'), w=(cv&&cv.clientWidth)||stenoCanvasCssW(), k=STENO_SHEET/w;   // 2 CSS-px в единицы листа
  var dx=(p[0]-last[0])/k, dy=(p[1]-last[1])/k;
  if(dx*dx+dy*dy < 4) return;            // микродвижения <2px — шум, не пишем
  st.push(p);
  var ti=stenoPointAt.length-1, now=Date.now();
  if(ti>=0){ if(!stenoPointAt[ti]) stenoPointAt[ti]=[]; stenoPointAt[ti].push(now); }
  stenoPaint(); stenoScheduleFade();
}
function stenoUp(e){
  if(stenoPid===null || (e.pointerId!=null && e.pointerId!==stenoPid)) return;
  stenoPid=null;
  var st=stenoDraw[stenoDraw.length-1];
  if(st && st.length===0){ stenoDraw.pop(); if(stenoPointAt.length>stenoDraw.length) stenoPointAt.pop(); }
  if(!stenoDraw.length){ stenoPaint(); return; }
  if(stenoPrefs.fadeMs>0) stenoScheduleFade();   // точка (один палец без движения) — валидный штрих, не выбрасываем
  if(stenoCheckTimer) clearTimeout(stenoCheckTimer);
  stenoCheckTimer=setTimeout(stenoCheck, STENO_CHECK_MS);   // автопроверка только ПОСЛЕ покоя
}
function stenoFeedback(ok){
  var w=$('stenoPadWrap'); if(!w) return;
  w.classList.toggle('is-ok', !!ok); w.classList.toggle('is-bad', !ok);
}
function stenoCheck(){
  stenoCheckTimer=null;
  if(stenoBusy || stenoMode!=='draw' || !stenoState) return;
  var card=STENO_MAP[stenoState.currentId];
  if(!card || !stenoDraw.length){ stenoPaint(); return; }
  var sim=stenoGrade(stenoDraw, card);
  var pass=sim >= (stenoTrace ? STENO_PASS_TRACE : STENO_PASS);
  stenoBusy=true; stenoBusySince=Date.now();   // след «замерзает» на время фидбека
  stenoState.dailyAttempts++;
  if(pass){
    stenoState.dailyCorrect++;
    stenoState.streak=(stenoState.streak|0)+1;
    if(stenoState.streakBest<stenoState.streak) stenoState.streakBest=stenoState.streak;
    if(stenoState.weights[card.id]!=null){ var nw=stenoState.weights[card.id]-1; if(nw>0) stenoState.weights[card.id]=nw; else delete stenoState.weights[card.id]; }
    haptic('success');
    stenoFeedback(true);
    saveSteno();
    stenoRenderStatus();   // стрик/счёт — живо, не только после следующей карточки
    renderStenoHome();
    stenoNextTimer=setTimeout(function(){
      stenoUnfreeze();
      stenoBusy=false; stenoFeedback(false);
      if(stenoState.dailyCorrect>=STENO_GOAL && !stenoState.freeMode){ renderSteno(); return; }
      stenoNextCard();
    }, STENO_NEXT_MS);
  } else {
    stenoState.dailyErrors++;
    stenoState.streak=0;                 // промах обнуляет серию (рекорд сохраняется)
    stenoState.weights[card.id]=Math.min(16, stenoWeight(stenoState, card.id)+1);  // ошибки поднимают вес
    stenoTrace=true;
    haptic('error');
    var w=$('stenoPadWrap'); if(w){ w.classList.remove('is-ok'); w.classList.add('is-bad'); }
    var tn0=$('stenoTraceNote'); if(tn0) tn0.hidden=false;   // заметка об обводке — сразу, не после клиринга
    stenoFitPad();
    stenoPaint();   // серый эталон — сразу под штрихом
    stenoRenderStatus();
    saveSteno();
    renderStenoHome();
    stenoClrTimer=setTimeout(function(){
      stenoUnfreeze();
      stenoBusy=false;
      /* «Очистить» больше не нужен: нарисованное остаётся видно поверх эталона
         и уходит само — либо новым касанием (stenoPendingFresh), либо затуханием. */
      stenoPendingFresh=true;
      var w2=$('stenoPadWrap'); if(w2) w2.classList.remove('is-bad');
      renderSteno(); stenoScheduleFade();
    }, STENO_FAIL_CLR_MS);
  }
}
function stenoNextCard(){
  if(!stenoState) return;
  stenoDraw=[]; stenoPointAt=[]; stenoPendingFresh=false; stenoTrace=false;
  stenoState.currentId=stenoPick(stenoState);
  saveSteno();
  renderSteno();
}

/* ---------- чтение знаков ---------- */
function stenoNormChar(chRaw){
  if(!chRaw) return '';
  var ch=String(chRaw).toUpperCase();
  var lat={'A':'Ф','B':'И','C':'С','D':'В','E':'У','F':'А','G':'П','H':'Р','I':'Ш','J':'О',
           'K':'Л','L':'Д','M':'Ь','N':'T','O':'Щ','P':'Я','Q':'Й','R':'К','S':'Ы','T':'Е',
           'U':'Н','V':'З','W':'Ц','X':'Ч','Y':'Н','Z':'Ё'};   // раскладка ЙЦУКЕН для забытой переключения
  if(lat[ch]) ch=lat[ch];
  if(ch==='Ё') return 'Ё';
  return (/^[А-Я]$/.test(ch)) ? ch : '';
}
function stenoLoadSign(card, box){
  /* В приоритете — точный SVG ГЕСС, уже вшитый в index.html как data URI:
     ни сеть, ни Android WebView для букв не нужны. Старые страницы без вшивки
     берут обычные assets. У обоих этапов таймаут: SVG → PNG → шаблон — ожидание
     ограничено, «вечной загрузки» картинки быть не может. */
  if(!card || !box) return;
  box.innerHTML='';
  var embedded=(typeof STENO_SVG_BUILTIN==='object' && STENO_SVG_BUILTIN) ? STENO_SVG_BUILTIN[card.svg] : null;
  var src=embedded || card.svg || card.png;
  if(!src){ stenoSignTmpl(card, box); return; }
  var im=document.createElement('img'), stage=src===card.png?1:0, timer=null, settled=false;
  im.alt=''; im.decoding='async'; im.draggable=false;
  function arm(){ timer=setTimeout(fail,2200); }
  function fail(){
    if(settled) return;
    if(timer){ clearTimeout(timer); timer=null; }
    if(stage===0 && card.png){ stage=1; im.src=card.png; arm(); return; }
    settled=true;
    stenoSignTmpl(card, box);
  }
  im.addEventListener('load', function(){ settled=true; if(timer){ clearTimeout(timer); timer=null; } });
  im.addEventListener('error', fail);
  im.src=src;
  box.appendChild(im);
  arm();
}
function stenoSignTmpl(card, box){
  stenoSignTmplDraw(box, card.templates[0]);
}
function stenoSignTmplDraw(box, tmpl){
  try{
    var cv=document.createElement('canvas'); cv.width=512; cv.height=512;
    var ctx=cv.getContext && cv.getContext('2d'); if(!ctx) return;
    ctx.setTransform(2,0,0,2,0,0);
    ctx.strokeStyle='rgba(120,120,140,.6)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(14,STENO_CY); ctx.lineTo(242,STENO_CY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14,STENO_BY); ctx.lineTo(242,STENO_BY); ctx.stroke();
    ctx.strokeStyle=stenoVar('--text','#333'); ctx.lineWidth=9; ctx.lineCap='round'; ctx.lineJoin='round';
    for(var ti=0;ti<tmpl.length;ti++){
      var st=tmpl[ti]; if(st.length<2) continue;
      ctx.beginPath(); ctx.moveTo(st[0][0], st[0][1]);
      stenoCurveTo(ctx,st);
      ctx.stroke();
    }
    box.innerHTML=''; box.appendChild(cv);
  }catch(e){}
}
function stenoReadRender(){
  var box=$('stenoSignInner'), kb=$('stenoKeyboard');
  var st=stenoReadState;
  var card=st && STENO_MAP[st.currentId];
  if(kb){
    if(!kb.childNodes.length && typeof buildMorseKeyboard==='function') buildMorseKeyboard(kb);   // своя раскладка, как в «Дактиле»
    var keys=kb.querySelectorAll ? kb.querySelectorAll('button[data-key]') : [];
    for(var qk=0;qk<keys.length;qk++){
      keys[qk].classList.remove('mk-good'); keys[qk].classList.remove('mk-bad'); keys[qk].classList.remove('mk-hint');
      keys[qk].disabled=!card;
    }
    if(card && stenoReadSolved && stenoReadAnswer){
      for(var gk=0;gk<keys.length;gk++) if(keys[gk].getAttribute('data-key')===stenoReadAnswer) keys[gk].classList.add('mk-good');
    } else if(card && stenoReadMiss){
      var accepted=card.reverseAcceptedLetters||[];
      for(var ak=0;ak<accepted.length;ak++) for(var hk=0;hk<keys.length;hk++)
        if(keys[hk].getAttribute('data-key')===accepted[ak]) keys[hk].classList.add('mk-hint');
    }
  }
  if(card) stenoLoadSign(card, box);
  else if(box) box.innerHTML='';
}
function stenoReadKey(chRaw, btn){
  var st=stenoReadState;
  if(!st || stenoBusy) return;
  var card=STENO_MAP[st.currentId]; if(!card) return;
  var ch=stenoNormChar(chRaw); if(!ch) return;
  var acc=card.reverseAcceptedLetters||[];
  if(acc.indexOf(ch)>=0){
    var firstTry=!stenoReadMiss;
    st.dailyAttempts++;
    if(firstTry){
      st.dailyCorrect++;
      st.streak=(st.streak|0)+1;
      if(st.streakBest<st.streak) st.streakBest=st.streak;
      if(st.weights[card.id]!=null){ var nw=st.weights[card.id]-1; if(nw>0) st.weights[card.id]=nw; else delete st.weights[card.id]; }
    } else {
      st.dailyErrors++;
      st.streak=0;
    }
    stenoBusy=true;
    stenoReadSolved=true; stenoReadAnswer=ch;
    var readKb=$('stenoKeyboard'), readKeys=readKb&&readKb.querySelectorAll?readKb.querySelectorAll('button[data-key]'):[];
    for(var rk=0;rk<readKeys.length;rk++) readKeys[rk].classList.remove('mk-hint');
    if(btn && btn.classList){ btn.classList.remove('mk-hint'); btn.classList.remove('mk-bad'); btn.classList.add('mk-good'); }
    haptic('success');
    saveStenoRead(); stenoRenderStatus(); renderStenoHome();
    stenoReadTimer=setTimeout(function(){
      stenoBusy=false;
      stenoReadMiss=false; stenoReadSolved=false; stenoReadAnswer='';
      st.currentId=stenoPick(st);
      saveStenoRead();
      stenoReadRender();
      stenoRenderStatus();
    }, STENO_READ_NEXT_MS);
  } else {
    if(btn && btn.classList) btn.classList.add('mk-bad');   // промах остаётся красным до следующего знака
    if(!stenoReadMiss){
      stenoReadMiss=true; stenoReadSolved=false; stenoReadAnswer='';
      st.streak=0;
      st.weights[card.id]=Math.min(16, stenoWeight(st, card.id)+1);
      haptic('error');
      saveStenoRead(); stenoRenderStatus(); renderStenoHome();
    }
    var kb=$('stenoKeyboard'), keys=kb&&kb.querySelectorAll?kb.querySelectorAll('button[data-key]'):[];
    for(var ai=0;ai<acc.length;ai++) for(var ki=0;ki<keys.length;ki++)
      if(keys[ki].getAttribute('data-key')===acc[ai]) keys[ki].classList.add('mk-hint');
  }
}
/* ---------- рендеры ---------- */
function stenoAccuracyText(st){
  if(!st || !st.dailyAttempts) return 'Точность —';
  return 'Точность '+Math.round(st.dailyCorrect*100/st.dailyAttempts)+'% · ошибок '+(st.dailyErrors|0);
}
function renderStenoHome(){
  var btnR=$('btnDrillStenoRead');
  var rows=[
    {name:'Стенография', id:'btnStenoStart', chip:'stenoChip', sub:'stenoSub', act:'stenoAct', prog:'stenoProg'},
    {name:'Чтение стенографии', id:'btnDrillStenoRead', chip:'stenoReadChip', sub:'stenoReadSub', act:'stenoReadAct', prog:'stenoReadProg'}
  ];
  var vMain, vRead;
  if(!stenoContent.ready){
    vMain={chipCls:'chip', chip:stenoContent.error?'Ошибка':'Загрузка',
           sub:stenoContent.error?'Знаки стенографии не загрузились':'Загружаем знаки…',
           act:'Начать', prog:0, disabled:true, quiet:false, done:false};
    vRead=vMain;
  } else if(!stenoState){ vMain=null; vRead=null;
  } else if(stenoState.dailyCorrect>=STENO_GOAL){
    vMain={chipCls:'chip is-done', chip:'Готово',
           sub:'Дневная цель выполнена · '+STENO_GOAL+' из '+STENO_GOAL,
           act:'Продолжить тренировку', prog:100, disabled:false, quiet:true, done:true};
  } else {
    var started=!!(stenoState.currentId || stenoState.dailyAttempts>0);
    if(started){
      var left=Math.max(0, STENO_GOAL-stenoState.dailyCorrect);
      var mins=Math.max(1, Math.round(left*18/60));
      vMain={chipCls:'chip is-active', chip:'В процессе',
             sub:stenoState.dailyCorrect+' из '+STENO_GOAL+' правильных · около '+mins+' '+plural(mins,'минуты','минут','минут'),
             act:'Продолжить', prog:Math.round(stenoState.dailyCorrect*100/STENO_GOAL), disabled:false, quiet:false, done:false};
    } else {
      vMain={chipCls:'chip', chip:'Сегодня',
             sub:'Сегодня ещё не начато · цель '+STENO_GOAL,
             act:'Начать', prog:0, disabled:false, quiet:false, done:false};
    }
  }
  if(stenoContent.ready && stenoReadState){
    var s=stenoReadState, st2=!!(s.currentId || s.dailyAttempts>0);
    vRead={chipCls:'chip'+(st2?' is-active':''), chip:st2?'В процессе':'Сегодня',
           sub:st2?stenoAccuracyText(s):'Учимся читать знаки',
           act:st2?'Продолжить':'Начать', prog:0, disabled:false, quiet:false, done:false};
  } else vRead=vMain;
  var vals=[vMain, vRead];
  rows.forEach(function(r, ri){
    var v=vals[ri]; if(!v) return;
    var btn=$(r.id), chip=$(r.chip), sub=$(r.sub), act=$(r.act);
    if(!btn || !chip || !sub || !act) return;
    chip.className=v.chipCls; chip.textContent=v.chip;
    sub.textContent=v.sub; act.textContent=v.act;
    btn.disabled=v.disabled;
    btn.classList.toggle('is-done', v.done);
    btn.classList.toggle('is-quiet', v.quiet);
    secProg(r.prog, v.prog);
    btn.setAttribute('aria-label', r.name+' — '+v.act);
  });
}
var stenoShownStreak=-1;
function stenoRenderStatus(){
  var main=$('stenoStatusMain'), sub=$('stenoStatusSub'), title=$('stenoSessTitle'), cue=$('stenoCue');
  if(title){
    title.textContent=stenoPrefs.system==='akopyan'
      ? (stenoMode==='read'?'Чтение · Акопьян':'Стенография · Акопьян')
      : (stenoMode==='read'?'Чтение стенографии':'Стенография');
  }
  var sc=0, sb=0;
  if(stenoMode==='read'){
    /* Дриллы без дневной нормы: только своя точность — как в «Дактиле». */
    var st=stenoReadState;
    if(main) main.textContent = st && st.dailyAttempts ? ('Точность: '+Math.round(st.dailyCorrect*100/st.dailyAttempts)+'%') : 'Точность: —';
    if(sub) sub.textContent = (st && st.dailyAttempts) ? ('Верных '+st.dailyCorrect+' из '+st.dailyAttempts) : 'Ответов пока нет';
    sc=(st && st.streak)|0; sb=(st && st.streakBest)|0;
  } else {
    var s=stenoState;
    if(main) main.textContent = s
      ? (s.freeMode ? 'Свободная тренировка' : ('Правильно: '+(s.dailyCorrect|0)+' / '+STENO_GOAL))
      : 'Правильно: 0 / '+STENO_GOAL;
    if(sub) sub.textContent = 'Точность: ' + (s && s.dailyAttempts ? Math.round(s.dailyCorrect*100/s.dailyAttempts)+'%' : '—');
    if(cue) cue.textContent = s && stenoTrace ? 'Обведи серый знак' : 'Рисуй знак по букве';
    sc=(s && s.streak)|0; sb=(s && s.streakBest)|0;
  }
  /* Стрик — как в Морзе: серия без ошибок, .rec при догоне рекорда, «bump» на цифре. */
  var stk=$('stenoStreak'), stkN=$('stenoStreakN');
  if(stk && stkN){
    stk.hidden=false;
    stkN.textContent=String(sc);
    if(sc>0 && sc!==stenoShownStreak){ stkN.classList.remove('bump'); void stkN.offsetWidth; stkN.classList.add('bump'); }
    stenoShownStreak=sc;
    stk.classList.toggle('rec', sc>0 && sc>=sb);
  }
}
function renderSteno(){
  if(!stenoState || !stenoContent.ready) return;
  stenoEnsureDays();
  var draw=$('stenoDrawPane'), read=$('stenoReadPane'), goal=$('stenoGoal'), view=$('view-steno');
  if(view) view.setAttribute('data-mode', stenoMode);
  if(draw) draw.hidden = stenoMode!=='draw';
  if(read) read.hidden = stenoMode!=='read';
  var ex=$('stenoEx'), kb=$('stenoKeyboard');
  if(ex) ex.classList.toggle('kbd-mode', stenoMode==='read');
  if(kb){
    if(stenoMode==='read'){ if(!kb.childNodes.length && typeof buildMorseKeyboard==='function') buildMorseKeyboard(kb); }
    kb.hidden = stenoMode!=='read';
  }
  if(stenoMode==='read'){ if(goal) goal.hidden=true; stenoReadRender(); stenoRenderStatus(); return; }
  stenoCancelTimers();
  var card=STENO_MAP[stenoState.currentId] || (STENO_CARDS.length?STENO_MAP[stenoPick(stenoState)]:null);
  if(card && stenoState.currentId!==card.id){ stenoState.currentId=card.id; saveSteno(); }
  var bl=$('stenoBigLetter'), hint=$('stenoHint'), tn=$('stenoTraceNote');
  if(bl){
    bl.textContent=card?card.letter:'';
    bl.classList.toggle('steno-group-letter',!!(card && card.letter && card.letter.length>1));
  }
  if(hint) hint.textContent=card?card.hint:'';
  if(tn) tn.hidden=!stenoTrace;
  if(goal){
    var showGoal = stenoState.dailyCorrect>=STENO_GOAL && !stenoState.freeMode;
    goal.hidden=!showGoal;
    if(showGoal){
      var line=$('stenoGoalLine');
      if(line) line.textContent=stenoState.dailyCorrect+' из '+STENO_GOAL+' правильных';
      var ga=$('stenoGAttempts'), ge=$('stenoGErrors'), gc=$('stenoGAccuracy');
      if(ga) ga.textContent=stenoState.dailyAttempts|0;
      if(ge) ge.textContent=stenoState.dailyErrors|0;
      if(gc) gc.textContent = stenoState.dailyAttempts ? Math.round(stenoState.dailyCorrect*100/stenoState.dailyAttempts)+'%' : '—';
    }
  }
  stenoRenderStatus();
  stenoFitPad();
  stenoPaint();
  stenoScheduleFade();
}
function openSteno(mode){
  /* «Бесконечная загрузка знаков» (исправление R44): строка живая мгновенно —
     пакет встроен в страницу, — а показ раздела ждал, пока догрузится СЛОВАРЬ
     (startApp). Тап в этот промежуток не делал ничего. state не привязан к
     словарю: поднимаем его сами тем же loadState(), каким это делает startApp
     (идемпотентно; прогресс слов читается из localStorage). */
  if((typeof state==='undefined')||!state){ try{ loadState(); }catch(e){} }
  if((typeof state==='undefined')||!state){
    if(stenoStartTries<40){ stenoStartTries++; setTimeout(function(){ try{openSteno(mode);}catch(e){} }, 200); }
    else toast('Приложение ещё готовится — попробуй ещё раз');
    return;
  }
  stenoStartTries=0;
  stenoEnsureDays();
  if(!stenoContent.ready){
    loadStenoContent();
    toast(stenoContent.error?'Знаки не загрузились — попробуй ещё раз':'Знаки ещё загружаются…');
    renderStenoHome();
    return;
  }
  stenoMode=mode;
  if(mode==='read'){ stenoReadMiss=false; stenoReadSolved=false; stenoReadAnswer=''; }
  if(mode==='read' && stenoReadState && !stenoReadState.currentId){ stenoReadState.currentId=stenoPick(stenoReadState); saveStenoRead(); }
  showView('steno');
}

/* ---------- проводка ---------- */
$('btnStenoStart').addEventListener('click', function(){ openSteno('draw'); });
$('btnDrillStenoRead').addEventListener('click', function(){ openSteno('read'); });
$('btnStenoBack').addEventListener('click', function(){ saveSteno(); saveStenoRead(); goHome(); });
$('btnStenoContinue').addEventListener('click', function(){
  if(!stenoState) return;
  stenoState.freeMode=true; saveSteno();
  stenoNextCard();
  renderStenoHome();
});
var elStenoPad=$('stenoPad');
if(elStenoPad){
  elStenoPad.addEventListener('pointerdown', stenoDown);
  elStenoPad.addEventListener('pointermove', stenoMove);
  elStenoPad.addEventListener('pointerup', stenoUp);
  elStenoPad.addEventListener('pointercancel', stenoUp);
  elStenoPad.addEventListener('lostpointercapture', stenoUp);
}
/* ── настройки кисти (ряды в «Настройках») ── */
function stenoFadeSubText(v){ return v>=8?'Не исчезает — как сейчас':('След гаснет за '+v+' '+plural(v,'секунду','секунды','секунд')); }
function stenoWidthSubText(w){ return 'Толщина: '+w+' '+(w<=9?'— тонко':(w>=20?'— жирно':'— средняя')); }
function stenoSyncSystemUI(){
  Array.prototype.forEach.call(document.querySelectorAll('[data-stenosystem]'), function(b){
    var on=b.getAttribute('data-stenosystem')===stenoPrefs.system;
    b.classList.toggle('on',on); b.setAttribute('aria-checked',on?'true':'false');
  });
}
function stenoSyncPaintUI(){
  stenoSyncSystemUI();
  Array.prototype.forEach.call(document.querySelectorAll('[data-stenopaint]'), function(b){
    var on=b.getAttribute('data-stenopaint')===stenoPrefs.paint;
    b.classList.toggle('on',on); b.setAttribute('aria-checked',on?'true':'false');
  });
  var wr=$('stenoWRange'), ws=$('stenoWSub'), fr=$('stenoFadeRange'), fs=$('stenoFadeSub');
  if(wr) wr.value=String(stenoPrefs.width);
  if(ws) ws.textContent=stenoWidthSubText(stenoPrefs.width);
  var v=stenoPrefs.fadeMs===0?8:Math.max(1,Math.min(7,Math.round(stenoPrefs.fadeMs/1000)));
  if(fr) fr.value=String(v);
  if(fs) fs.textContent=stenoFadeSubText(v);
}
var elStenoKb=$('stenoKeyboard');
if(elStenoKb){
  elStenoKb.addEventListener('click', function(e){
    var b=(e.target&&typeof e.target.closest==='function')?e.target.closest('button[data-key]'):null;
    if(!b) return;
    if(stenoMode!=='read' || !state || state.view!=='steno') return;
    stenoReadKey(b.getAttribute('data-key'), b);
  });
}
(function(){
  Array.prototype.forEach.call(document.querySelectorAll('[data-stenosystem]'), function(b){
    b.addEventListener('click', function(){ stenoSetSystem(b.getAttribute('data-stenosystem')); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-stenopaint]'), function(b){
    b.addEventListener('click', function(){
      var v=b.getAttribute('data-stenopaint');
      stenoPrefs.paint=(v==='default'||/^#[0-9a-f]{6}$/i.test(v))?v:'default';
      stenoSavePrefs(); stenoSyncPaintUI();
      try{ if(state && state.view==='steno' && stenoMode==='draw') stenoPaint(); }catch(e){}
    });
  });
  var wr=$('stenoWRange'), fr=$('stenoFadeRange');
  if(wr) wr.addEventListener('input', function(){
    stenoPrefs.width=Math.max(6,Math.min(28,Math.round(+wr.value||13)));
    stenoSavePrefs(); stenoSyncPaintUI();
    try{ if(state && state.view==='steno' && stenoMode==='draw') stenoPaint(); }catch(e){}
  });
  if(fr) fr.addEventListener('input', function(){
    var v=Math.max(1,Math.min(8,Math.round(+fr.value||8)));
    stenoPrefs.fadeMs=v>=8?0:v*1000;
    stenoSavePrefs(); stenoSyncPaintUI();
    try{ if(state && state.view==='steno' && stenoMode==='draw'){ stenoScheduleFade(); stenoPaint(); } }catch(e){}
  });
})();
window.addEventListener('pagehide', function(){ try{ saveSteno(); saveStenoRead(); }catch(e){} });
window.addEventListener('resize', function(){ if(stenoMode==='draw' && typeof state!=='undefined' && state && state.view==='steno'){ try{ stenoFitPad(); stenoPaint(); stenoScheduleFade(); }catch(e){} } });
try{
  if(typeof ResizeObserver==='function'){
    var stenoPaneObserver=new ResizeObserver(function(){
      if(stenoMode==='draw' && typeof state!=='undefined' && state && state.view==='steno'){ try{ stenoFitPad(); stenoPaint(); }catch(e){} }
    });
    var stenoObservedPane=$('stenoDrawPane'); if(stenoObservedPane) stenoPaneObserver.observe(stenoObservedPane);
  }
}catch(e){}

/* Бут раздела: контент из кэша/сети, затем состояния. Сбои стено изолированы —
   слова, языки и морзе не знают о них ничего. */
try{
  stenoLoadPrefs();
  loadStenoContent();
  stenoLoadStates();
  renderStenoHome();
}catch(e){ try{ console.warn('steno init failed:', e && e.message); }catch(_){ } }


