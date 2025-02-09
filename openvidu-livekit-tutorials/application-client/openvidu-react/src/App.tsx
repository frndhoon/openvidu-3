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
import { useState, useEffect, useCallback, useRef } from "react";
import VideoComponent from "./components/VideoComponent";
import AudioComponent from "./components/AudioComponent";
import { Excalidraw } from '@excalidraw/excalidraw';
import { Client } from '@stomp/stompjs'

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
// let LIVEKIT_URL = "wss://www.grimtalk.com:7443/";
// let APPLICATION_SERVER_URL = "http://localhost:5555/";
// let LIVEKIT_URL = "ws://localhost:7880/";

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

  // Excalidraw 관련 상태 추가
  const [leftElements, setLeftElements] = useState([]);
  const [rightElements, setRightElements] = useState([]);
  const [isLeftBoard, setIsLeftBoard] = useState(true);
  const [leftExcalidrawAPI, setLeftExcalidrawAPI] = useState(null);
  const [rightExcalidrawAPI, setRightExcalidrawAPI] = useState(null);


  // STOMP 클라이언트 설정
  const [stompClient, setStompClient] = useState<Client | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // STOMP 연결 설정
  useEffect(() => {
    const client = new Client({
      brokerURL: 'wss://jaemoon99.site:28080/ws',
      onConnect: () => {
        setIsConnected(true);
        console.log('Connected to STOMP');
      },
      onDisconnect: () => {
        setIsConnected(false);
        console.log('Disconnected from STOMP');
      }
    });

    try {
      client.activate();
      setStompClient(client);
    } catch (error) {
      console.error('STOMP connection failed:', error);
    }

    return () => {
      if (client.active) {
        client.deactivate();
      }
    };
  }, []);

  // STOMP 구독 설정
  useEffect(() => {
    if (stompClient && isConnected) {
      const subscription = stompClient.subscribe('/topic/greetings', (message) => {
        const data = JSON.parse(message.body);
        console.log('Received data:', data); // 데이터 수신 확인

        if (data.type === 'excalidraw') {
          if (data.boardType === 'left' && roomCreator !== participantName) {
            console.log('Updating left board:', data.elements);
            setLeftElements([...data.elements]); // 배열 복사하여 상태 업데이트
            if (leftExcalidrawAPI) {
              leftExcalidrawAPI.updateScene({ elements: data.elements }); // API를 통한 즉시 업데이트
            }
          } else if (data.boardType === 'right' && roomCreator === participantName) {
            console.log('Updating right board:', data.elements);
            setRightElements([...data.elements]); // 배열 복사하여 상태 업데이트
            if (rightExcalidrawAPI) {
              rightExcalidrawAPI.updateScene({ elements: data.elements }); // API를 통한 즉시 업데이트
            }
          }
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [stompClient, isConnected, roomCreator, participantName, leftExcalidrawAPI, rightExcalidrawAPI]);

  // 화이트보드 업데이트 함수
  const updateBoard = useCallback((elements: any, boardType: 'left' | 'right') => {
    if (stompClient?.active && isConnected) {
      try {
        stompClient.publish({
          destination: '/app/hello',
          body: JSON.stringify({
            type: 'excalidraw',
            boardType: boardType,
            elements: elements,
            sender: participantName
          })
        });
      } catch (error) {
        console.error('Failed to send Excalidraw data:', error);
      }
    }
  }, [stompClient, isConnected, participantName]);

  useEffect(() => {
    fetchRoomList();
  }, []);

  // 방 생성 함수
  async function createRoom(roomName: string, creator: string) {
    setRoomName(roomName);
    const room = new Room();
    setRoom(room);

    // 방장 정보 저장 시 'rtc ' 접두사 없이 저장
    localStorage.setItem('roomCreator', creator);
    setRoomCreator(creator);

    room.on(
      RoomEvent.TrackSubscribed,
      (
        _track: RemoteTrack,
        publication: RemoteTrackPublication, // 원격 트랙 정보
        participant: RemoteParticipant // 참가자 식별자
      ) => {
        setRemoteTracks((prev) => [
          ...prev,
          {
            trackPublication: publication,
            participantIdentity: participant.identity
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
      const createChatTokenResponse = await getToken(roomName, `chat ${participantName}`);
      const createRtcTokenResponse = await getToken(roomName, `rtc ${participantName}`);

      setChatToken(createChatTokenResponse);
      setRtcToken(createRtcTokenResponse);

      console.log("Chat Token (chat):", createChatTokenResponse);
      console.log("RTC Token (rtc):", createRtcTokenResponse);

      // 방에 연결
      await room.connect(LIVEKIT_URL, createRtcTokenResponse);

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

  // 방 참여 로직
  async function joinRoom(roomName: string, creator: string) {
    setRoomName(roomName);
    const room = new Room();
    setRoom(room);

    localStorage.setItem('roomCreator', creator.replace('rtc ', '')); // rtc 접두사 제거
    setRoomCreator(creator.replace('rtc ', ''));

    // 이벤트 리스너 설정
    room.on(RoomEvent.TrackSubscribed,
      (_track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        setRemoteTracks((prev) => [
          ...prev,
          {
            trackPublication: publication,
            participantIdentity: participant.identity,
          },
        ]);
      }
    );

    room.on(RoomEvent.TrackUnsubscribed,
      (_track: RemoteTrack, publication: RemoteTrackPublication) => {
        setRemoteTracks((prev) =>
          prev.filter(
            (track) => track.trackPublication.trackSid !== publication.trackSid
          )
        );
      }
    );

    try {
      // RTC 토큰 발급
      const joinRtcTokenResponse = await joinToken(roomName, `rtc ${participantName}`);
      const joinChatTokenResponse = await joinToken(roomName, `chat ${participantName}`);

      setRtcToken(joinRtcTokenResponse);
      setChatToken(joinChatTokenResponse);

      // LiveKit 서버에 연결
      await room.connect(LIVEKIT_URL, joinRtcTokenResponse);

      // 방장이 아니라면 카메라와 마이크 활성화 필요X
      // await room.localParticipant.enableCameraAndMicrophone();
      // setLocalTrack(
      //   room.localParticipant.videoTrackPublications.values().next().value?.videoTrack
      // );

    } catch (error) {
      console.error("방 참여 중 오류 발생:", (error as Error).message);
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

  // TODO: 라이브 종료 함수(백엔드에서 라이브 종료 요청 로직 추가 필요)
  async function endLive() {
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

  // 방 생성(createRoom 함수) 시 토큰 발급 로직
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

  // 방 참여(joinRoom 함수) 시 토큰 발급 로직
  async function joinToken(roomName: string, participantName: string) {
    const response = await fetch(APPLICATION_SERVER_URL + "join", {
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
  const handleCreateRoom = (selectedRoom: string, creator: string) => {
    createRoom(selectedRoom, creator);
  };

  // 방 참여 핸들러
  const handleJoinRoom = (selectedRoom: string, creator: string) => {
    joinRoom(selectedRoom, creator);
  };

  return (
    <>
      {!room ? (
        <div className="join-container">
          <div className="join-content">
            {/* 왼쪽 패널: 사용자 입력 섹션 */}
            <div className="left-panel">
              {/* 사용자 정보 섹션 */}
              <div className="section-container">
                <h2>사용자 정보</h2>
                <div className="input-group">
                  <label htmlFor="participant-name">참가자 이름</label>
                  <input
                    id="participant-name"
                    type="text"
                    value={participantName}
                    onChange={(e) => setParticipantName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* 방 생성 섹션 */}
              <div className="section-container">
                <h2>방 생성하기</h2>
                <div className="input-group">
                  <label htmlFor="room-name">방 이름</label>
                  <input
                    id="room-name"
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    required
                  />
                </div>

                <button
                  className="create-button"
                  type="button"
                  disabled={!roomName || !participantName}
                  onClick={() => handleCreateRoom(roomName, participantName)}
                >
                  방 만들기
                </button>
              </div>
            </div>

            {/* 오른쪽 패널: 라이브 목록 섹션 */}
            <div className="live-list-panel">
              <h2>현재 진행중인 라이브</h2>
              <div className="live-list">
                {Object.entries(availableRooms).map(([room, creator]) => (
                  <div key={room} className="live-card">
                    <div className="live-card-content">
                      <div className="live-info">
                        <span className="live-badge">LIVE</span>
                        <h3>{room}</h3>
                        <p>방장: {creator.replace('rtc ', '')}</p>
                      </div>
                      <button
                        type="button"
                        className="join-button"
                        onClick={() => handleJoinRoom(room, creator)}
                      >
                        참여하기
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
            {roomCreator !== participantName && remoteTracks.length > 0 && (
              <div>
                {remoteTracks
                  .filter(track => track.participantIdentity === `rtc ${roomCreator}`) // rtc 토큰 접두사 필터링
                  .map((remoteTrack) => (
                    remoteTrack.trackPublication.kind === "video" ? (
                      <VideoComponent
                        key={remoteTrack.trackPublication.trackSid}
                        track={remoteTrack.trackPublication.videoTrack!}
                        participantIdentity={remoteTrack.participantIdentity.replace('rtc ', '')} // rtc 토큰 접두사 제거
                      />
                    ) : (
                      <AudioComponent
                        key={remoteTrack.trackPublication.trackSid}
                        track={remoteTrack.trackPublication.audioTrack!}
                      />
                    )
                  ))}
              </div>
            )}
          </div>
          {/* 채팅 컴포넌트 */}
          <LiveKitRoom
            serverUrl={LIVEKIT_URL}
            token={chatToken}
            connect={true}
          >
            <Chat />
          </LiveKitRoom>
          {/* Excalidraw 컴포넌트 */}
          <div className="whiteboard-container" style={{ display: 'flex', gap: '20px' }}>
            <div className="excalidraw-wrapper" style={{ flex: 1 }}>
              <h3>왼쪽 화이트보드 {roomCreator === participantName ? '(내 보드)' : ''}</h3>
              <Excalidraw
                onChange={(elements) => {
                  if (roomCreator === participantName) {
                    setLeftElements(elements);
                    updateBoard(elements, 'left');
                  }
                }}
                elements={leftElements}
                excalidrawAPI={(api) => setLeftExcalidrawAPI(api)}
                viewModeEnabled={roomCreator !== participantName}

                updateScene={(elements) => {
                  updateBoard(elements, 'left');
                }}
              />
            </div>
            <div className="excalidraw-wrapper" style={{ flex: 1 }}>
              <h3>오른쪽 화이트보드 {roomCreator !== participantName ? '(내 보드)' : ''}</h3>
              <Excalidraw
                onChange={(elements) => {
                  if (roomCreator !== participantName) {
                    setRightElements(elements);
                    updateBoard(elements, 'right');
                  }
                }}
                elements={rightElements}
                excalidrawAPI={(api) => setRightExcalidrawAPI(api)}
                viewModeEnabled={roomCreator === participantName}

                updateScene={(elements) => {
                  updateBoard(elements, 'right');
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}





export default App;
