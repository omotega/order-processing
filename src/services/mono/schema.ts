import { z } from 'zod';

export const initiateBvnLookupSchema = z.object({
  bvn: z.string().regex(/^\d{11}$/, 'BVN must be 11 digits'),
  scope: z.enum(['identity', 'bank_accounts']).optional(),
});

export type InitiateBvnLookupType = z.infer<typeof initiateBvnLookupSchema>;

export const verifyBvnOtpSchema = z.object({
  otp: z.string().min(4).max(8),
});

export type VerifyBvnOtpType = z.infer<typeof verifyBvnOtpSchema>;

export const monoInitiateResponseSchema = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  data: z
    .object({
      session_id: z.string(),
      methods: z
        .array(
          z.object({
            method: z.string(),
            hint: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type MonoInitiateResponseType = z.infer<
  typeof monoInitiateResponseSchema
>;

export const monoVerifyResponseSchema = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  data: z
    .object({
      bvn: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      dob: z.string().optional(),
    })
    .optional(),
});

export type MonoVerifyResponseType = z.infer<typeof monoVerifyResponseSchema>;

export const lookupNinSchema = z.object({
  nin: z.string().regex(/^\d{11}$/, 'NIN must be 11 digits'),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD')
    .optional(),
  output: z.enum(['pdf']).optional(),
});

export type LookupNinType = z.infer<typeof lookupNinSchema>;

export const pollNinJobSchema = z.object({
  jobId: z.string().min(1),
});

export type MonoNinPdf = {
  jobId: string;
  status: 'processing' | 'completed';
  url?: string;
};

export type MonoNinLookupData = {
  pdf?: MonoNinPdf;
  title: string;
  firstname: string;
  surname: string;
  nin: string;
  birthdate: string;
  birthstate: string;
  birthlga: string;
  birthcountry: string;
  gender: string;
  telephoneno: string;
  email: string;
  residence_address: string;
  residence_lga: string;
  residence_state: string;
  residence_town: string;
  maritalstatus: string;
  religion: string;
  profession: string;
  educationallevel: string;
  employmentstatus: string;
  spoken_language: string;
  central_iD: string;
  tracking_id: string;
  middlename?: string;
  heigth?: string;
  photo?: string;
  nok_address1?: string;
  nok_address2?: string;
  nok_firstname?: string;
  nok_lga?: string;
  nok_middlename?: string;
  nok_postalcode?: string;
  nok_state?: string;
  nok_surname?: string;
  nok_town?: string;
  ospokenlang?: string;
  pfirstname?: string;
  pmiddlename?: string;
  psurname?: string;
  residencestatus?: string;
  self_origin_lga?: string;
  self_origin_place?: string;
  self_origin_state?: string;
  userid?: string;
  vnin?: string;
};

export type MonoNinLookupResponse = {
  status: string;
  message: string;
  timestamp: string;
  data: MonoNinLookupData;
};

export type MonoNinJobResponse = {
  status: string;
  message: string;
  timestamp: string;
  data: {
    id: string;
    status: 'processing' | 'completed';
    url?: string;
  };
};
