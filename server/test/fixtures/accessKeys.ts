/**
 * TEST-ONLY RSA key pair for Cloudflare Access tokens. NEVER use outside tests.
 * Production refuses injected keys unless ACCESS_TEAM_DOMAIN ends in ".invalid" (see src/admin/access.ts).
 */
export const TEST_ACCESS_PRIVATE_JWK = {
  "kty": "RSA",
  "n": "nlamvABuqqCGazLxZKkvYqbBaKq1z24hKTmry5AxWkSymOWIoAMqU9kvbvGnzlbjTPow4CROG87tD9EfOwRRyWmc0bM8ANyhpbtjtwOqUnme2Q2OkllBGaPUnnIjYJAF-eij_l0Vq4a4mQZ2y8wkK8ca75k-xcDSBIHabj3tAFI39nkrkVPGt-ihvGSLquhlOkJdKNyPeaIsZJx-B1TswKQd5h3OTgsiKSdgDMEGNsLj7WSbwp1CxPeA3eV5qVlw-W3zBh4Z_J5TImRZGRDyYhrZuZD-tT3XQapcjlLJyAi6Dgi5ENTpRhLa_6gIivZFAdfBFpfn464Hpk4Qb-8yNw",
  "e": "AQAB",
  "d": "AkXU_7fYJ_X76j7cz1HMqi7YlnAruMc6oA4mS5GWuFZFiEyY3-H5dpCmzcsFWlMErIV6RmjMtst43--s8hYQgDBWVKKIa4fjyYnvxOks_I7wWzPP5oUGUTJUZbAfu03RXLbTcqccQmB4iQHICC7a98Z43qa3wmDq4tOtMo3nktpMV5Hq6A_G5cVsuzc-Ump23V-3sfvKVBQFhyLjDdsA8mhZ7fRIDoIIb5ASazjbzmV4jKM4sibktTNYOoRiGPT6oBjmfaEmzCU2FBm2XsOPNJ0XS_CKv5KalsZmVV7_0JNLHjYtsfH3oSoNKeIrE3IXZ9Cl_V5q7R9FQRLGpVBKoQ",
  "p": "1GaRHR3kwQO2RssRzliGB_Xltsn9Iexk-E09Q-OVK1liIsVC9HafUjwLZDKjF1XVXvuG-fDfjjD4sDkn4OiUXVrmm-rqNEAW3-byUsVWLU27FSrotihiY0nyiUt71lZng0ggSfZYvzhBTDXrOGaIFc9XUnAmUP9Np4yP00KgaZE",
  "q": "vtcsdzBrYQfPPVbMCuUVZAliOq_gFOkp80fQxYrLUQ5EQrukOhQfFfl9QdO0YF3g3EUpgWlafhZBXvfY1lFyRG1S5Eb1RKtN-BCzF5M7zvIo-grpLMzeSS2ubTISObsxaV5-hYpOo6ly_9Gn3quioUkc7F8IqPBzyfHZD_CFu0c",
  "dp": "CupaesyWfPTb4Td-asRR3wbcD1DCGYQ0jC4r_9kqSVgGmxLYJggSl_9N9pBDoWdf18nFXgLq-ju6DBRj4EMTnNiXEVw5PQYuJsOPoIFTtHBSNPxHiVT5-XBLbpLagmFeYHjMcACg_vK9KFV9CSD7zWMicbIhxffY3ctzeL_rzoE",
  "dq": "EPlIbi1zT4UHTLhcm5d2iJhBEWE1OAbpAUdg7UEEBmiTb7AK0lOZ1DWFi4ZN48hVyKGqKGV7c_18wPqgYaeK10U1-zHIfNwTqj2qAC3LQwPM2zh_Nsnd93pFqlaqwlHA-lM6Q5xilDHtFY3LNYXkiB3dobRuK8B_O_XzzXQiIN8",
  "qi": "0oVRyOglwoU5aaXOB_i7nVJPQSdkf7YHF0U5TgGwhbEL4tgukz7-WsR6XrEQj1JhSqTwFANomFFMxRi2wWtj_TEDCIJmiFL_klbisN7uTeTGxeTfWLFqH78imCZM6-nrv3k1hrKV8bpfu7gCRXtpB894SexFe-mxxN9dckCWJ9k",
  "kid": "test-key-1",
  "alg": "RS256"
} as const;

export const TEST_ACCESS_JWKS = { keys: [{
  "kty": "RSA",
  "n": "nlamvABuqqCGazLxZKkvYqbBaKq1z24hKTmry5AxWkSymOWIoAMqU9kvbvGnzlbjTPow4CROG87tD9EfOwRRyWmc0bM8ANyhpbtjtwOqUnme2Q2OkllBGaPUnnIjYJAF-eij_l0Vq4a4mQZ2y8wkK8ca75k-xcDSBIHabj3tAFI39nkrkVPGt-ihvGSLquhlOkJdKNyPeaIsZJx-B1TswKQd5h3OTgsiKSdgDMEGNsLj7WSbwp1CxPeA3eV5qVlw-W3zBh4Z_J5TImRZGRDyYhrZuZD-tT3XQapcjlLJyAi6Dgi5ENTpRhLa_6gIivZFAdfBFpfn464Hpk4Qb-8yNw",
  "e": "AQAB",
  "kid": "test-key-1",
  "alg": "RS256",
  "use": "sig"
}] } as const;
