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
        <title>Регистрация</title>
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
                        <h1>Регистрация</h1>
                        <div class="new_reg"><p>Уже есть аккаунт? <a href="login.php">Авторизуйтесь</a></p></div>
                        
                        <form class="user_login" action="vendor/signup.php" method="post">
                            
                            <label class="fn">Имя:</label>
                            <div><input class="firstname" type="text" id="firstname" name="firstname" required></div>
                          
                            <label class="ln">Фамилия:</label>
                            <div><input class="lastname" type="text" id="lastname" name="lastname" required></div>

                            <label class="em">Email:</label>
                            <div><input class="email" type="email" id="email" name="email" required></div>
                          
                            <label class="pwd">Пароль:</label>
                            <div><input class="password" type="password" id="password" name="password" required></div>

                            <label class="pwd">Подтвердите пароль:</label>
                            <div><input class="password" type="password" id="password_confirm" name="password_confirm" required></div>
                                                    
                            <div><input class="login_button" type="submit" value="Зарегистрироваться"></div>

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
    </body>
</html>