<?php
session_start();
require_once 'connect.php';

$email = $_POST['email'];
$password = md5($_POST['password']);

$query = "SELECT * FROM `clients` WHERE `email` = ? AND `password` = ?";
$stmt = mysqli_prepare($connect, $query);
mysqli_stmt_bind_param($stmt, "ss", $email, $password);
mysqli_stmt_execute($stmt);
$result = mysqli_stmt_get_result($stmt);

if (mysqli_num_rows($result) > 0) {
    $user = mysqli_fetch_assoc($result);

    $_SESSION['user'] = [
        "id" => $user['id'],
        "account_balance" => $user['account_balance'],
        "account_opening_date" => $user['account_opening_date'],
        "income" => $user['income'],
        "percents" => $user['percents'],
        "program" => $user['program']
    ];

    mysqli_stmt_close($stmt);
    mysqli_close($connect);
    header('Location: ../dashboard.php');
    exit();
} else {
    $_SESSION['message'] = 'Неверный логин или пароль';
    mysqli_stmt_close($stmt);
    mysqli_close($connect);
    header('Location: ../login.php');
    exit();
}
?>