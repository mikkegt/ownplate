module.exports = {
  root: true,
  env: {
    browser: true,
    node: true
  },
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    'prettier',
    '@vue/typescript/recommended'
  ],
  plugins: ["vue"],
  rules: {
    "no-console": "off", //console.log();OK
    "no-unused-vars": "off",
    "vue/max-attributes-per-line": "off",

    "no-irregular-whitespace": "warn",
    "vue/no-unused-vars": "warn",
    "vue/multi-word-component-names": "warn",
    "vue/require-v-for-key": "warn",
    "vue/no-reserved-component-names": "warn",
    "vue/no-unused-components": "warn",
    "@typescript-eslint/ban-ts-comment": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/ban-ts-comment": "warn",
    "no-unused-vars": "warn",
    "no-extra-semi": "warn",
    "no-unexpected-multiline": "warn",
    "no-unreachable": "warn",
  }
};
