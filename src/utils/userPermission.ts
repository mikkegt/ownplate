export const checkAdminPermission = (ctx: any) => {
  if (!ctx.root.$store.getters.uidAdmin) {
    const redirectUrl = encodeURIComponent(ctx.root.$route.path);
    if (redirectUrl) {
      ctx.root.$router.replace("/admin/user/signin?to=" + redirectUrl);
    } else {
      ctx.root.$router.replace("/admin/user/signin");
    }
    return false;
  }
  return true;
};

export const checkShopAccount = (shopInfo: any, ownerUid: string) => {
  return shopInfo.uid === ownerUid;
};

export const checkShopOwner = (shopInfo: any, uidAdmin: string) => {
  return shopInfo.uid === uidAdmin;
};
