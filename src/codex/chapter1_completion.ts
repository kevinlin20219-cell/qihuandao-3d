// This callback runs after the deer has been helped, not immediately after the bridge.
export function chapter1Completion(time, falls, leafCount) {
  const total = Math.round(Math.max(0, time));
  return `用时 ${Math.floor(total / 60)} 分 ${total % 60} 秒，跌落 ${falls} 次。三人合力修好了吊桥，也帮苔鹿取下了鹿角上的断木，继续向森林深处出发。共点亮 ${leafCount} 片光之叶。`;
}
