import {
  LocalVideoTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
} from "livekit-client";
import { LiveKitRoom } from "./custom-livekit/src/components/LiveKitRoom";
import { Chat } from "./custom-livekit/src/prefabs/Chat";
import "./App.css";
import { useState, useEffect } from "react";
import VideoComponent from "./components/VideoComponent";
import AudioComponent from "./components/AudioComponent";

// 트랙 정보를 저장하기 위한 타입 정의
// trackPublication: 원격 트랙 정보를 담고 있는 객체
// participantIdentity: 참가자의 고유 식별자
type TrackInfo = {
  trackPublication: RemoteTrackPublication;
  participantIdentity: string;
};

// 서버 URL 설정
// APPLICATION_SERVER_URL: 토큰 발급 등 백엔드 서비스를 제공하는 서버 주소
// LIVEKIT_URL: WebRTC 연결을 위한 LiveKit 서버 주소
let APPLICATION_SERVER_URL = "https://jaemoon99.site:15555/"; 
let LIVEKIT_URL = "wss://jaemoon99.site:7443/";

// configureUrls();

// function configureUrls() {
//   // If APPLICATION_SERVER_URL is not configured, use default value from OpenVidu Local deployment
//   if (!APPLICATION_SERVER_URL) {
//     // if (window.location.hostname === "localhost") {
//     //   APPLICATION_SERVER_URL = "http://localhost:5555/";
//     // } else {
//     //   APPLICATION_SERVER_URL = "https://" + window.location.hostname + ":15555/";
//     // }
//     APPLICATION_SERVER_URL = "http://43.202.81.12:5555/";
//     // APPLICATION_SERVER_URL = "https://jaemoon99.site:15555/";

//   }

//   // If LIVEKIT_URL is not configured, use default value from OpenVidu Local deployment
//   if (!LIVEKIT_URL) {
//     // if (window.location.hostname === "localhost") {
//     //   LIVEKIT_URL = "ws://localhost:7880/";
//     // } else {
//     //   LIVEKIT_URL = "wss://" + window.location.hostname + ":7443/";
//     // }
//     LIVEKIT_URL = "ws://43.202.81.12:7880/";
//     // LIVEKIT_URL = "wss://jaemoon99.site:7443/";
//   }
// }

function App() {
  const [room, setRoom] = useState<Room | undefined>(undefined);              // 현재 접속한 방 정보
  const [localTrack, setLocalTrack] = useState<LocalVideoTrack | undefined>( // 로컬 사용자의 비디오 트랙
    undefined
  );
  const [remoteTracks, setRemoteTracks] = useState<TrackInfo[]>([]);         // 원격 참가자들의 트랙 정보

  // 참가자 이름 - 랜덤 번호를 붙여서 생성(추후 userData.nickname 값으로 변경 예정)
  const [participantName, setParticipantName] = useState(
    "Participant" + Math.floor(Math.random() * 100)
  );

  
  // 추후 강의 이름 혹은 random 값으로 받아올 예정
  const [roomName, setRoomName] = useState(""); // 현재 방 이름

  // "방 이름": "rtc 방장이름(token 값)"
  // {
  //   "123": "rtc Participant16",
  //   "test": "rtc Participant74",
  //   "1223": "rtc Participant42",
  //   "4234": "rtc Participant93"
  // }
  const [availableRooms, setAvailableRooms] = useState<string[]>([]); // 사용 가능한 방 목록
  
  // 방장 정보는 로컬 스토리지에서 관리
  const [roomCreator, setRoomCreator] = useState<string | null>(() => {
    return localStorage.getItem('roomCreator');
  });

  // 각각의 기능별 토큰 상태 관리
  const [rtcToken, setRtcToken] = useState<string>('');                     // 비디오/오디오 스트리밍용 토큰
  const [chatToken, setChatToken] = useState<string>('');                   // 채팅 기능용 토큰
  const [excalidrawToken, setExcalidrawToken] = useState<string>('');      // 화이트보드 기능용 토큰

  useEffect(() => {
    fetchRoomList();
  }, []); 

  // 방 생성 함수
  async function createRoom() {
    // 새로운 Room 인스턴스 생성
    const room = new Room();
    setRoom(room);
    // 방장 정보를 localStorage에 저장
    localStorage.setItem('roomCreator', participantName);
    setRoomCreator(participantName);

    // 방 이벤트 리스너 설정
    // TrackSubscribed: 새로운 트랙이 구독될 때 실행
    room.on(
      RoomEvent.TrackSubscribed,
      (
        _track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        setRemoteTracks((prev) => [
          ...prev,
          {
            trackPublication: publication,
            participantIdentity: participant.identity,
          },
        ]);
      }
    );

    // TrackUnsubscribed: 트랙 구독이 해제될 때 실행
    room.on(
      RoomEvent.TrackUnsubscribed,
      (_track: RemoteTrack, publication: RemoteTrackPublication) => {
        setRemoteTracks((prev) =>
          prev.filter(
            (track) => track.trackPublication.trackSid !== publication.trackSid
          )
        );
      }
    );

    try {
      // 토큰 발급 로직
      const chatTokenResponse = await getToken(roomName, `chat ${participantName}`);
      const excalidrawTokenResponse = await getToken(roomName, `excalidraw ${participantName}`);
      const rtcTokenResponse = await getToken(roomName, `rtc ${participantName}`);

      setChatToken(chatTokenResponse);
      setExcalidrawToken(excalidrawTokenResponse);
      setRtcToken(rtcTokenResponse);

      console.log("Chat Token (chat):", chatTokenResponse);
      console.log("Excalidraw Token (excalidraw):", excalidrawTokenResponse);
      console.log("RTC Token (rtc):", rtcTokenResponse);

      // 방에 연결
      await room.connect(LIVEKIT_URL, rtcTokenResponse);

      // 카메라와 마이크 활성화
      await room.localParticipant.enableCameraAndMicrophone();
      setLocalTrack(
        room.localParticipant.videoTrackPublications.values().next().value
          ?.videoTrack
      );
    } catch (error) {
      console.log(
        "There was an error connecting to the room:",
        (error as Error).message
      );
      await leaveRoom();
    }
  }


  // 방 나가기 함수
  async function leaveRoom() {
    await room?.disconnect();                    // 방 연결 해제
    localStorage.removeItem('roomCreator');      // 방장 정보 삭제
    setRoomCreator(null);
    setRoom(undefined);
    setLocalTrack(undefined);
    setRemoteTracks([]);                        // 모든 상태 초기화
  }

  /**
   * --------------------------------------------
   * 애플리케이션 서버에서 토큰 발급받기
   * --------------------------------------------
   * 아래 메서드는 애플리케이션 서버에 토큰 생성을 요청합니다.
   * 이를 통해 LiveKit API 키와 시크릿을 클라이언트 측에 노출할 
   * 필요가 없어집니다.
   * 
   * 이 샘플 코드에서는 사용자 제어가 전혀 없습니다.
   * 누구나 애플리케이션 서버 엔드포인트에 접근할 수 있습니다.
   * 실제 프로덕션 환경에서는 애플리케이션 서버가 엔드포인트 접근을 허용하기 위해 사용자를 식별해야 합니다.
   */

  // 토큰 발급 로직
  async function getToken(roomName: string, participantName: string) {
    const response = await fetch(APPLICATION_SERVER_URL + "token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomName: roomName,
        participantName: participantName,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get token: ${error.errorMessage}`);
    }

    const data = await response.json();
    return data.token;
  }


  // 방 참여 로직
  async function joinRoom(roomToJoin: string) {
    setRoomName(roomToJoin);
    // 새로운 Room 인스턴스 생성
    const newRoom = new Room();
    setRoom(newRoom);

    // 방 이벤트 리스너 설정
    // 새로운 트랙이 수신될 때
    newRoom.on(
      RoomEvent.TrackSubscribed,
      (
        _track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        // roomCreator가 없을 때만 설정(없어도 될 거 같음)
        if (!localStorage.getItem('roomCreator')) {
          localStorage.setItem('roomCreator', participant.identity);
          setRoomCreator(participant.identity);
        }
        setRemoteTracks((prev) => [
          ...prev,
          {
            trackPublication: publication,
            participantIdentity: participant.identity,
          },
        ]);
      }
    );

    // 트랙이 소멸될 때
    newRoom.on(
      RoomEvent.TrackUnsubscribed,
      (_track: RemoteTrack, publication: RemoteTrackPublication) => {
        setRemoteTracks((prev) =>
          prev.filter(
            (track) => track.trackPublication.trackSid !== publication.trackSid
          )
        );
      }
    );

    try {
      // 방 참여 토큰 발급
      const rtcTokenResponse = await getToken(roomToJoin, `rtc ${participantName}`);
      const chatTokenResponse = await getToken(roomToJoin, `chat ${participantName}`);
      const excalidrawTokenResponse = await getToken(roomToJoin, `excalidraw ${participantName}`);

      setRtcToken(rtcTokenResponse);
      setChatToken(chatTokenResponse);
      setExcalidrawToken(excalidrawTokenResponse);

      // 방에 연결
      await newRoom.connect(LIVEKIT_URL, rtcTokenResponse);
      
      await newRoom.localParticipant.enableCameraAndMicrophone();
      setLocalTrack(
        newRoom.localParticipant.videoTrackPublications.values().next().value
          ?.videoTrack
      );
    } catch (error) {
      console.log(
        "There was an error joining the room:",
        (error as Error).message
      );
      await leaveRoom();
    }
  }

  // 사용 가능한 방 목록을 가져오는 함수
  async function fetchRoomList() {
    try {
      const response = await fetch(APPLICATION_SERVER_URL + "rooms");
      if (!response.ok) {
        throw new Error('Failed to fetch rooms');
      }
      const rooms = await response.json();
      setAvailableRooms(rooms);
    } catch (error) {
      console.error('방 목록을 가져오는데 실패했습니다:', error);
    }
  }

  // 방 성생 핸들러
  const handleCreateRoom = (selectedRoom: string) => {
    setRoomName(selectedRoom);
    createRoom();
  };

  // 방 참여 핸들러
  const handleJoinRoom = (selectedRoom: string) => {
    joinRoom(selectedRoom);
  };

  return (
    <>
      {!room ? (
        <div id="join">
          <div id="join-dialog">
            <h2>이름 설정</h2>
            <form>
              <div>
                <label htmlFor="participant-name">이름</label>
                <input
                  id="participant-name"
                  className="form-control"
                  type="text"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  required
                />
              </div>
              <div>
                <h2>방 생성</h2>
                <label htmlFor="room-name">방 이름</label>
                <input
                  id="room-name"
                  className="form-control"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  required
                />
              </div>
              <button
                className="btn btn-lg btn-success"
                type="submit"
                disabled={!roomName || !participantName}
                onClick={() => handleCreateRoom(roomName)}
              >
                Create
              </button>
              <hr />
              <div>
                <h2>라이브 목록</h2>
                <div className="room-buttons">
                  {Object.keys(availableRooms).map((room) => (
                    <button
                      key={room}
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleJoinRoom(room)}
                    >
                      {room}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div id="room">
          <div id="room-header">
            <h2 id="room-title">{roomName}</h2>
            {room && roomCreator === participantName && (
              <button
                className="btn btn-large btn-danger"
                onClick={leaveRoom}
              >
                Leave Room
              </button>
            )}
          </div>
          <div id="layout-container">
            {/* 방장일 때는 자신의 비디오만 표시 */}
            {roomCreator === participantName && localTrack && (
              <VideoComponent
                track={localTrack}
                participantIdentity={participantName}
                local={true}
              />
            )}
            {/* 참여자일 때는 방장의 비디오만 표시 */}
            {roomCreator !== participantName && remoteTracks
              .filter(track => track.participantIdentity === roomCreator)
              .map((remoteTrack) =>
                remoteTrack.trackPublication.kind === "video" ? (
                  <VideoComponent
                    key={remoteTrack.trackPublication.trackSid}
                    track={remoteTrack.trackPublication.videoTrack!}
                    participantIdentity={remoteTrack.participantIdentity}
                  />
                ) : (
                  <AudioComponent
                    key={remoteTrack.trackPublication.trackSid}
                    track={remoteTrack.trackPublication.audioTrack!}
                  />
                )
            )}
          </div>
          <LiveKitRoom
            serverUrl={LIVEKIT_URL}
            token={chatToken}
            connect={true}
          >
            <Chat />
          </LiveKitRoom>
        </div>
      )}
    </>
  );
}

export default App;
