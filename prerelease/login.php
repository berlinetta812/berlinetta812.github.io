<?php
    session_start();

    if ($_SESSION['user']) {
        header('Location: dashboard.php');
    }
?>

<!DOCTYPE html>
<html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width">
        <title>Вход</title>
        <link rel="stylesheet" href="css/style.css">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans&display=swap" rel="stylesheet">
        <meta name="theme-color" content="#08a652">

        <link rel="icon" href="/img/favicon.ico">
    </head>
    <body>
        <div class="wrapper">
            <header></header>
            <main class="main_login">
                <div class="login_container">
                    <div class="login_form">
                        <h1>Вход в личный кабинет</h1>
                        <form class="user_login" action="vendor/signin.php" method="POST">
                            <label for="email">Логин:</label>
                            <div><input class="email" type="text" id="email" name="email" required></div>
                        
                            <label class="pwd" for="password">Пароль:</label>
                            <div><input class="password" type="password" id="password" name="password" required></div>
                        
                            <div><input class="login_button" type="submit" value="Войти"></div>
                           
                            <div class="new_user"><p>Новый пользователь? <a href="registration.php"> Создайте аккаунт</a></p></div>
                            <p class="msg">
                                <?php 
                                echo $_SESSION['message'];
                                unset($_SESSION['message']);
                                ?>
                            </p>
                          </form>
                    </div>
                </div>
            </main>
            <footer></footer>
        </div>
        <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
        <script src="js/auth.js"></script>
    </body>
</html>