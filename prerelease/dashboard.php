<?php
    session_start();

    if (!isset($_SESSION['user']) || empty($_SESSION['user'])) {
        header('Location: login.php');
        exit();
    }

    if (isset($_SESSION['LAST_ACTIVITY']) && (time() - $_SESSION['LAST_ACTIVITY'] > 1800)) {
        session_unset();
        session_destroy();
        header('Location: login.php');
        exit();
    }
    
    $_SESSION['LAST_ACTIVITY'] = time();
?>

<!DOCTYPE html>
<html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width">
        <title>Личный Кабинет</title>
        <link rel="stylesheet" href="css/style.css">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans&display=swap" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@600&display=swap" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Geologica:wght@500&display=swap" rel="stylesheet">
        <meta name="theme-color" content="#08a652">
        <meta name="format-detection" content="telephone=no">

        <link rel="icon" href="/img/favicon.ico">
    </head>
    <body>
        <div class="wrapper">
            <header class="header">
                <div class="h_img"><img src="img/logo2.svg"><div>ФинансЮг</div></div>
                <nav>
                    <ul class="menu">
                        <li><a href="index.html">Главная</a></li>
                        <li><a href="#asset">Вклады</a></li>
                        <li><a href="loans.html">Займы</a></li>
                        <li><a href="#footer">Контакты</a></li>
                        <li><span><a href="login.php">Личный Кабинет</a></span></li>
                    </ul>
                </nav>

                <div class="header_contaner">
                    <div class="menu_burger">
                        <span></span>
                    </div>
                    <nav class="burger_nav">
                        <ul class="burger_list">
                            <li><a href="index.html">Главная</a></li>
                            <li><a href="#asset">Вклады</a></li>
                            <li><a href="loans.html">Займы</a></li>
                            <li><a href="#footer">Контакты</a></li>
                            <li><span><a href="login.php">Личный Кабинет</a></span></li>
                        </ul>
                    </nav>
                    <div class="logo"><img src="img/logo2.svg"><div>ФинансЮг</div></div>
                </div>
            </header>
            <main class="main">
                <section class="db_1">
                    <div class="prestats"><p>Обзор баланса</p></div>
                    <hr>
                    <div class="commonstats">
                        <div class="stats">
                            <div class="stats_content">
                                <div class="balance">
                                    <span>Баланс:</span>
                                    <span class="amount"><?= $_SESSION['user']['account_balance']?> ₽</span>
                                </div>
                                <div class="income">
                                    <span>Доход:</span>
                                    <span><?= $_SESSION['user']['income']?> ₽</span>
                                </div>
                                <span class="rate">Ставка: <?= $_SESSION['user']['percents']?> %</span>
                                <span>Программа: <?= $_SESSION['user']['program']?></span>
                                <div class="open_date">
                                    <span>Дата открытия счета:</span>
                                    <span class="date"><?= $_SESSION['user']['account_opening_date']?></span>
                                </div>
                            </div>
                        </div>

                        <div class="actions">
                            <div class="actions_head"><p>Действия</p></div>
                            <a href="index.html"><div class="add_fund"><div>Пополнить</div><div><img src="img/depo.svg"></div></div></a>
                            <a href="index.html"><div class="add_fund"><div>Снять</div><div><img src="img/withdraw.svg"></div></div></a>
                            <a href="vendor/logout.php"><div class="add_fund"><div>Выйти из ЛК</div><div><img src="img/logout2.svg"></div></div></a>
                        </div>
                    </div>
                </section>
                    
            </main>
            <a name="footer"><footer class="footer"></a>
                <div class="f_items">
                    <div class="f_menu">
                        <li><a href="index.html">Главная</a></li>
                        <li><a href="#asset">Вклады</a></li>
                        <li><a href="loans.html">Займы</a></li>
                        <li><a href="#footer">Контакты</a></li>
                    </div>
                    <div class="contacts">
                        <p>КПК "ФинансЮг"</p>
                        <p>ИНН: 1655217870</p>
                        <p>ОГРН: 1111690047391</p>
                        <p class="address">Адрес: г. Ростов-на-Дону, ул. Благодатная, д. 247, офис 104</p>
                    </div>
                </div>
                <div class="rights"><p>© 2012—2023, КПК «ФинансЮг», официальный сайт, лицензия ЦБ РФ от 21.02.2012</p></div>
            </footer>
        </div>
        <script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
        <script src="js/menu.js"></script>
    </body>
</html>