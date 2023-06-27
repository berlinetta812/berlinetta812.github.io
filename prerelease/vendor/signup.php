<?php
session_start();
require_once 'connect.php';

$firstname = $_POST['firstname'];
$lastname = $_POST['lastname'];
$email = $_POST['email'];
$password = $_POST['password'];
$password_confirm = $_POST['password_confirm'];

if ($password === $password_confirm) {
    $password = md5($password);

    $query = "INSERT INTO `clients` (`id`, `first_name`, `last_name`, `email`, `password`) VALUES (NULL, ?, ?, ?, ?)";

    $stmt = mysqli_prepare($connect, $query);
    mysqli_stmt_bind_param($stmt, "ssss", $firstname, $lastname, $email, $password);
    mysqli_stmt_execute($stmt);

    mysqli_stmt_close($stmt);
    mysqli_close($connect);

    header('Location: ../dashboard.php');
    exit();
} else {
    $_SESSION['message'] = 'Пароли не совпадают';
    header('Location: ../registration.php');
    exit();
}