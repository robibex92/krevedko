import {
  validateRequired,
  validateEmail,
  validateMinLength,
  validateMaxLength,
} from "../core/validators/index.js";

/**
 * Validate register data
 */
export function validateRegister(data) {
  validateRequired(data, ["email", "password"]);

  const email = validateEmail(data.email);
  const password = validateMinLength(data.password, 6, "password");

  const name = data.name
    ? validateMaxLength(data.name, 100, "name")
    : null;

  const phone = data.phone
    ? validateMaxLength(data.phone, 20, "phone")
    : null;

  const firstName = data.firstName
    ? validateMaxLength(data.firstName, 50, "firstName")
    : null;

  const lastName = data.lastName
    ? validateMaxLength(data.lastName, 50, "lastName")
    : null;

  return {
    email,
    password,
    name,
    phone,
    firstName,
    lastName,
  };
}

/**
 * Validate login data
 */
export function validateLogin(data) {
  validateRequired(data, ["email", "password"]);

  const email = validateEmail(data.email);
  const password = data.password; // Don't validate length for login

  return {
    email,
    password,
  };
}

/**
 * Validate password reset request
 */
export function validateForgotPassword(data) {
  validateRequired(data, ["email"]);

  const email = validateEmail(data.email);

  return { email };
}

/**
 * Validate password reset
 */
export function validateResetPassword(data) {
  validateRequired(data, ["email", "token", "password"]);

  const email = validateEmail(data.email);
  const token = data.token;
  const password = validateMinLength(data.password, 6, "password");

  return {
    email,
    token,
    password,
  };
}

/**
 * Validate email update
 */
export function validateUpdateEmail(data) {
  validateRequired(data, ["email"]);

  const email = validateEmail(data.email);

  return { email };
}

