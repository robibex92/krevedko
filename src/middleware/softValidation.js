/**
 * Мягкая валидация входных данных
 * Не блокирует запросы, но логирует проблемы и предупреждает
 */

import { securityLogger } from "./securityLogger.js";

/**
 * Валидация email
 */
export function validateEmailSoft(email) {
  if (!email) return { isValid: false, message: "Email обязателен" };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, message: "Некорректный формат email" };
  }

  // Проверка на подозрительные домены
  const suspiciousDomains = [
    "tempmail.org",
    "10minutemail.com",
    "guerrillamail.com",
    "mailinator.com",
  ];

  const domain = email.split("@")[1]?.toLowerCase();
  if (suspiciousDomains.includes(domain)) {
    securityLogger.log("SUSPICIOUS_EMAIL", {
      email,
      domain,
      severity: "MEDIUM",
    });
  }

  return { isValid: true, message: "" };
}

/**
 * Валидация пароля
 */
export function validatePasswordSoft(password) {
  if (!password) return { isValid: false, message: "Пароль обязателен" };

  if (password.length < 6) {
    return {
      isValid: false,
      message: "Пароль должен содержать минимум 6 символов",
    };
  }

  // Проверка на слабые пароли
  const weakPasswords = [
    "password",
    "123456",
    "qwerty",
    "admin",
    "password123",
    "123456789",
    "qwerty123",
  ];

  if (weakPasswords.includes(password.toLowerCase())) {
    securityLogger.log("WEAK_PASSWORD_ATTEMPT", {
      password: password.substring(0, 3) + "***",
      severity: "LOW",
    });
  }

  return { isValid: true, message: "" };
}

/**
 * Валидация телефона
 */
export function validatePhoneSoft(phone) {
  if (!phone) return { isValid: true, message: "" };

  const cleanPhone = phone.replace(/\D/g, "");

  if (cleanPhone.length < 10) {
    return {
      isValid: false,
      message: "Телефон должен содержать минимум 10 цифр",
    };
  }

  if (cleanPhone.length > 11) {
    return {
      isValid: false,
      message: "Телефон не должен содержать более 11 цифр",
    };
  }

  return { isValid: true, message: "" };
}

/**
 * Валидация имени
 */
export function validateNameSoft(name) {
  if (!name) return { isValid: true, message: "" };

  if (name.length < 2) {
    return {
      isValid: false,
      message: "Имя должно содержать минимум 2 символа",
    };
  }

  if (name.length > 50) {
    return {
      isValid: false,
      message: "Имя не должно содержать более 50 символов",
    };
  }

  // Проверка на подозрительные символы
  const suspiciousChars = /[<>{}[\]\\]/;
  if (suspiciousChars.test(name)) {
    securityLogger.log("SUSPICIOUS_NAME", {
      name: name.substring(0, 10) + "***",
      severity: "LOW",
    });
  }

  return { isValid: true, message: "" };
}

/**
 * Middleware для мягкой валидации регистрации
 */
export function softValidationRegister(req, res, next) {
  const { email, password, firstName, lastName, phone } = req.body;
  const errors = [];
  const warnings = [];

  // Валидация email
  const emailValidation = validateEmailSoft(email);
  if (!emailValidation.isValid) {
    errors.push(`Email: ${emailValidation.message}`);
  }

  // Валидация пароля
  const passwordValidation = validatePasswordSoft(password);
  if (!passwordValidation.isValid) {
    errors.push(`Пароль: ${passwordValidation.message}`);
  }

  // Валидация имен
  if (firstName) {
    const firstNameValidation = validateNameSoft(firstName);
    if (!firstNameValidation.isValid) {
      errors.push(`Имя: ${firstNameValidation.message}`);
    }
  }

  if (lastName) {
    const lastNameValidation = validateNameSoft(lastName);
    if (!lastNameValidation.isValid) {
      errors.push(`Фамилия: ${lastNameValidation.message}`);
    }
  }

  // Валидация телефона
  if (phone) {
    const phoneValidation = validatePhoneSoft(phone);
    if (!phoneValidation.isValid) {
      errors.push(`Телефон: ${phoneValidation.message}`);
    }
  }

  // Логируем проблемы, но не блокируем запрос
  if (errors.length > 0) {
    securityLogger.log("VALIDATION_WARNINGS", {
      endpoint: "/api/auth/register",
      errors,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      severity: "LOW",
    });
  }

  // Добавляем информацию о валидации в запрос
  req.validationWarnings = errors;

  next();
}

/**
 * Middleware для мягкой валидации входа
 */
export function softValidationLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = [];

  // Валидация email
  const emailValidation = validateEmailSoft(email);
  if (!emailValidation.isValid) {
    errors.push(`Email: ${emailValidation.message}`);
  }

  // Валидация пароля
  const passwordValidation = validatePasswordSoft(password);
  if (!passwordValidation.isValid) {
    errors.push(`Пароль: ${passwordValidation.message}`);
  }

  // Логируем проблемы
  if (errors.length > 0) {
    securityLogger.log("VALIDATION_WARNINGS", {
      endpoint: "/api/auth/login",
      errors,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      severity: "LOW",
    });
  }

  req.validationWarnings = errors;
  next();
}

/**
 * Middleware для мягкой валидации профиля
 */
export function softValidationProfile(req, res, next) {
  const { firstName, lastName, phone } = req.body;
  const errors = [];

  // Валидация имен
  if (firstName) {
    const firstNameValidation = validateNameSoft(firstName);
    if (!firstNameValidation.isValid) {
      errors.push(`Имя: ${firstNameValidation.message}`);
    }
  }

  if (lastName) {
    const lastNameValidation = validateNameSoft(lastName);
    if (!lastNameValidation.isValid) {
      errors.push(`Фамилия: ${lastNameValidation.message}`);
    }
  }

  // Валидация телефона
  if (phone) {
    const phoneValidation = validatePhoneSoft(phone);
    if (!phoneValidation.isValid) {
      errors.push(`Телефон: ${phoneValidation.message}`);
    }
  }

  // Логируем проблемы
  if (errors.length > 0) {
    securityLogger.log("VALIDATION_WARNINGS", {
      endpoint: "/api/profile",
      errors,
      userId: req.user?.id,
      ip: req.ip,
      severity: "LOW",
    });
  }

  req.validationWarnings = errors;
  next();
}
