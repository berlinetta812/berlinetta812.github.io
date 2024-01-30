<?php
mb_language("ru");
mb_internal_encoding("UTF-8");

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Проверка reCAPTCHA
    $recaptcha_secret = '6LfMrmApAAAAAJ5ptZXoUs6n-LxAhdy7If2Up-SW';
    $recaptcha_response = $_POST['g-recaptcha-response'];

    $url = "https://www.google.com/recaptcha/api/siteverify?secret={$recaptcha_secret}&response={$recaptcha_response}";
    $recaptcha = json_decode(file_get_contents($url));

    if (!$recaptcha->success) {
        // CAPTCHA не прошла, выводим ошибку или перенаправляем на страницу с формой
        echo "CAPTCHA не прошла проверку.";
        exit();
    }

    // Получение данных из формы
    $имя = $_POST["name"];
    $контакт = $_POST["phone"];
    $комментарий = !empty($_POST["comment"]) ? $_POST["comment"] : "Комментарий не указан";

    $адрес_получателя = "inn-tour161@mail.ru";
    $тема = "Заявка";
    $сообщение = "Имя: $имя\nКонтакт: $контакт\nКомментарий: $комментарий";

    $headers = "MIME-Version: 1.0" . "\r\n";
    $headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";

    // Отправка электронного письма
    mail($адрес_получателя, $тема, $сообщение, $headers);

    // Перенаправление после успешной отправки
    header("Location: index.html");
    exit();
}
?>